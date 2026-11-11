import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  insights,
  recurringRules,
  transactions,
  type Insight,
  type InsightType,
} from '@/db/schema';
import { getSetting, setSetting } from '@/db/settings';
import { budgetStatus } from '@/features/budgets/repository';
import { monthRange, todayKey, toMonthKey, dayjs } from '@/lib/date';
import { newId } from '@/lib/id';
import {
  budgetRiskDrafts,
  savingsRateDrafts,
  spendingAnomalyDraft,
  subscriptionAuditDrafts,
  upcomingRecurringDraft,
  type InsightDraft,
} from './generators';

/** 展示中的洞察（active），生成时间倒序 */
export async function listActiveInsights(): Promise<Insight[]> {
  return db
    .select()
    .from(insights)
    .where(eq(insights.status, 'active'))
    .orderBy(sql`${insights.generatedAt} DESC`);
}

/** 「知道了」：仅覆盖看过的数字；条件再触发会生成新行/复活 */
export async function acknowledgeInsight(id: string): Promise<void> {
  await db
    .update(insights)
    .set({ status: 'acknowledged', acknowledgedAt: Date.now() })
    .where(eq(insights.id, id));
}

/* ------------------------------- 数据查询 ------------------------------- */

type TxSig = { count: number; maxUpdatedAt: number };

async function txSignature(): Promise<TxSig> {
  const [row] = await db
    .select({
      count: sql<number>`COUNT(*)`.mapWith(Number),
      maxUpdatedAt: sql<number>`COALESCE(MAX(${transactions.updatedAt}), 0)`.mapWith(Number),
    })
    .from(transactions);
  return row ?? { count: 0, maxUpdatedAt: 0 };
}

const ANOMALY_WINDOW_DAYS = 183;

/** 生成候选洞察：全部本地 SQL + 纯函数，不产生任何网络/LLM 调用 */
export async function buildCandidates(): Promise<InsightDraft[]> {
  const today = todayKey();
  const periodKey = toMonthKey(today);
  const [start, end] = monthRange(periodKey);

  const [budget, topExpense, rules, monthTotals, trailingTotals] = await Promise.all([
    budgetStatus('month', periodKey, today),
    topExpenseOfMonth(start, today),
    db.select().from(recurringRules),
    monthTotalsOf(periodKey),
    trailingMonthTotals(periodKey, 3),
  ]);

  const drafts: InsightDraft[] = [];
  drafts.push(...budgetRiskDrafts(budget, periodKey));

  if (topExpense?.categoryId) {
    const samples = await categorySamples(
      topExpense.categoryId,
      topExpense.id,
      ANOMALY_WINDOW_DAYS,
    );
    drafts.push(
      ...spendingAnomalyDraft({ top: topExpense, samples }, periodKey),
    );
  }

  drafts.push(...subscriptionAuditDrafts(rules, periodKey));
  drafts.push(...savingsRateDrafts({ current: monthTotals, trailing: trailingTotals }, periodKey));
  drafts.push(...upcomingRecurringDraft({ todayKey: today, rules }));
  return drafts;
}

async function topExpenseOfMonth(start: string, end: string) {
  const [row] = await db
    .select({
      id: transactions.id,
      note: transactions.note,
      amountBaseCents: transactions.amountBaseCents,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, 'expense'),
        sql`${transactions.dateKey} >= ${start}`,
        sql`${transactions.dateKey} <= ${end}`,
      ),
    )
    .orderBy(sql`${transactions.amountBaseCents} DESC`)
    .limit(1);
  return row ?? null;
}

/** 某分类近 N 天（不含本笔）的支出金额样本（本位币分） */
async function categorySamples(
  categoryId: string,
  excludeTxId: string,
  days: number,
): Promise<number[]> {
  // dateKey 是本地时区固化的 'YYYY-MM-DD'，截止日必须同样在本地计算，
  // 不能用 SQLite 的 date('now')（UTC）否则跨日错位
  const cutoff = dayjs().subtract(days, 'day').format('YYYY-MM-DD');
  const rows = await db
    .select({ amount: transactions.amountBaseCents })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, 'expense'),
        eq(transactions.categoryId, categoryId),
        sql`${transactions.id} != ${excludeTxId}`,
        sql`${transactions.dateKey} >= ${cutoff}`,
      ),
    )
    .limit(500);
  return rows.map((row) => row.amount);
}

/** 某月收入/支出（本位币分；支出含转账手续费折算，口径同预算/统计） */
async function monthTotalsOf(monthKey: string) {
  const [start, end] = monthRange(monthKey);
  const [row] = await db
    .select({
      income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amountBaseCents} ELSE 0 END), 0)`.mapWith(Number),
      expense: sql<number>`COALESCE(SUM(CASE
        WHEN ${transactions.type} = 'expense' THEN ${transactions.amountBaseCents}
        WHEN ${transactions.type} = 'transfer' THEN CAST(ROUND(${transactions.fee} * ${transactions.exchangeRate} / 1000000.0) AS INTEGER)
        ELSE 0 END), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        sql`${transactions.dateKey} >= ${start}`,
        sql`${transactions.dateKey} <= ${end}`,
      ),
    );
  return row ?? { income: 0, expense: 0 };
}

async function trailingMonthTotals(currentMonthKey: string, n: number) {
  const [y, m] = currentMonthKey.split('-').map(Number);
  const result: { income: number; expense: number }[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(y!, m! - 1 - i + 1, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    result.push(await monthTotalsOf(key));
  }
  return result;
}

/* ------------------------------ 生成与落库 ------------------------------ */

type InsightsMeta = TxSig & { monthKey: string; builtAt: number };
const META_KEY = 'insights.meta';

/**
 * 交易数据或月份未变则跳过（每数据版本至多重算一次）。
 * @returns 本次是否真的重算（调用方据此失效缓存）
 */
export async function generateInsightsIfNeeded(): Promise<boolean> {
  const today = todayKey();
  const monthKey = toMonthKey(today);
  const sig = await txSignature();
  const meta = await getSetting<InsightsMeta>(META_KEY);
  if (
    meta &&
    meta.monthKey === monthKey &&
    meta.count === sig.count &&
    meta.maxUpdatedAt === sig.maxUpdatedAt
  ) {
    return false;
  }
  const drafts = await buildCandidates();
  await persistDrafts(drafts);
  await setSetting(META_KEY, { ...sig, monthKey, builtAt: Date.now() });
  return true;
}

type StoredInsight = Insight & { tier: number };

/**
 * 落库语义（Sure 同款「确认只覆盖看过的数字」）：
 * - 无行 → 新增 active
 * - active → 刷新数字与正文
 * - acknowledged → 档位升高才复活（warn→over），否则只静默更新快照
 * - 候选之外的 active 行删除（条件消失）；候选之外的 acknowledged 行一并清理
 */
async function persistDrafts(drafts: InsightDraft[]): Promise<void> {
  const rows = await db.select().from(insights);
  const byKey = new Map(rows.map((row) => [row.dedupKey, row]));
  const now = Date.now();
  const candidateKeys = new Set(drafts.map((draft) => draft.dedupKey));

  await db.transaction(() => {
    for (const draft of drafts) {
      const existing = byKey.get(draft.dedupKey);
      const values = {
        type: draft.type,
        dedupKey: draft.dedupKey,
        periodKey: draft.periodKey,
        title: draft.title,
        body: draft.body,
        dataJson: JSON.stringify({ tier: draft.tier, ...draft.data }),
        actionRoute: draft.actionRoute,
        generatedAt: now,
      };
      if (!existing) {
        db.insert(insights)
          .values({ id: newId(), status: 'active', ...values })
          .run();
        continue;
      }
      const stored = parseTier(existing.dataJson);
      const resurface =
        existing.status === 'active' || draft.tier > stored.tier;
      db.update(insights)
        .set({
          ...values,
          ...(resurface
            ? { status: 'active' as const, acknowledgedAt: null }
            : {}),
        })
        .where(eq(insights.id, existing.id))
        .run();
    }
    const stale = rows
      .filter((row) => !candidateKeys.has(row.dedupKey))
      .map((row) => row.id);
    if (stale.length > 0) {
      db.delete(insights).where(inArray(insights.id, stale)).run();
    }
  });
}

export function parseTier(dataJson: string): Pick<StoredInsight, 'tier'> {
  try {
    const parsed = JSON.parse(dataJson) as { tier?: unknown };
    return { tier: typeof parsed.tier === 'number' ? parsed.tier : 0 };
  } catch {
    return { tier: 0 };
  }
}

/** 测试/调试用：清空全部洞察 */
export async function clearInsights(): Promise<void> {
  await db.delete(insights);
}
