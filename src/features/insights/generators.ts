import type { InsightType } from '@/db/schema';
import { formatCentsWithSymbol } from '@/lib/money';
import { insightsCopy } from './labels';
import type { BudgetStatus } from '@/features/budgets/repository';
import type { RecurringRule } from '@/db/schema';

/**
 * 候选洞察（纯函数输出）：tier 是「严重度档位」，用于 acknowledged 行的复活判定——
 * 只有档位升高（warn→over）才算「新数字、新洞察」重新浮出。
 */
export type InsightDraft = {
  type: InsightType;
  dedupKey: string;
  /** 生成月 'YYYY-MM' */
  periodKey: string;
  title: string;
  body: string;
  /** 数值快照：与 dataJson 一起落库，便于后续分析 */
  data: Record<string, number | string>;
  actionRoute: string | null;
  tier: number;
};

/* ------------------------------ budget_risk ------------------------------ */

export type BudgetRiskInput = Pick<BudgetStatus, 'total' | 'categories'>;

/** 预算告急/超支：总预算与各分类预算中 level 为 warn/over 的各取最严重一条 */
export function budgetRiskDrafts(
  status: BudgetRiskInput,
  periodKey: string,
): InsightDraft[] {
  const drafts: InsightDraft[] = [];
  const pick = (item: BudgetStatus['total'], scope: string) => {
    if (!item || (item.level !== 'warn' && item.level !== 'over')) return;
    const name = scope === 'total' ? '总预算' : `${scope}预算`;
    const tier = item.level === 'over' ? 2 : 1;
    drafts.push({
      type: 'budget_risk',
      dedupKey: `budget_risk:${periodKey}:${item.budgetId}`,
      periodKey,
      title: `${name}${item.level === 'over' ? '已超支' : '接近上限'}`,
      body:
        item.level === 'over'
          ? insightsCopy.budgetOver(
              name,
              item.pct,
              formatCentsWithSymbol(Math.abs(item.remaining)),
            )
          : insightsCopy.budgetWarn(
              name,
              item.pct,
              formatCentsWithSymbol(Math.max(0, item.remaining)),
            ),
      data: { level: item.level, pct: item.pct, remaining: item.remaining },
      actionRoute: '/budgets',
      tier,
    });
  };
  pick(status.total, 'total');
  if (drafts.length > 0) return drafts.slice(0, 1); // 总预算优先，最多一条
  const worst = [...status.categories]
    .filter((item) => item.level === 'warn' || item.level === 'over')
    .sort((a, b) => levelRank(b) - levelRank(a) || b.pct - a.pct)[0];
  if (worst) pick(worst, worst.name);
  return drafts;
}

function levelRank(item: { level: string }): number {
  return item.level === 'over' ? 2 : item.level === 'warn' ? 1 : 0;
}

/* ---------------------------- spending_anomaly ---------------------------- */

export type AnomalyInput = {
  /** 本月最大一笔支出（本位币分） */
  top: {
    id: string;
    note: string;
    amountBaseCents: number;
    categoryId: string | null;
  } | null;
  /** 该分类近 183 天（不含本笔）支出金额样本（本位币分），须 ≥5 个才评估 */
  samples: number[];
};

/** 大额异常：最大单笔 ≥ 同分类历史中位数 ×3（样本 ≥5） */
export function spendingAnomalyDraft(
  input: AnomalyInput,
  periodKey: string,
): InsightDraft[] {
  const { top, samples } = input;
  if (!top || !top.categoryId || samples.length < 5) return [];
  const median = medianOf(samples);
  if (median <= 0) return [];
  const multiple = top.amountBaseCents / median;
  if (multiple < 3) return [];
  const rounded = Math.round(multiple);
  return [
    {
      type: 'spending_anomaly',
      dedupKey: `spending_anomaly:${periodKey}:${top.id}`,
      periodKey,
      title: '大额支出提醒',
      body: insightsCopy.anomaly(
        top.note.trim() || '本笔支出',
        formatCentsWithSymbol(top.amountBaseCents),
        rounded,
      ),
      data: { multiple: rounded, amountBaseCents: top.amountBaseCents },
      actionRoute: '/ledger',
      tier: 1,
    },
  ];
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/* ---------------------------- subscription_audit --------------------------- */

export type RuleLike = Pick<
  RecurringRule,
  'id' | 'name' | 'amount' | 'frequency' | 'interval' | 'type' | 'enabled' | 'autoCreate'
>;

/** 周期支出折算月度金额（分）：daily×30/interval、weekly×52/12、monthly×1、yearly×1/12 */
export function monthlyEquivalentCents(rule: RuleLike): number {
  const per = rule.amount;
  switch (rule.frequency) {
    case 'daily':
      return Math.round((per * 30) / Math.max(1, rule.interval));
    case 'weekly':
      return Math.round((per * 52) / 12 / Math.max(1, rule.interval));
    case 'monthly':
      return Math.round(per / Math.max(1, rule.interval));
    case 'yearly':
      return Math.round(per / 12 / Math.max(1, rule.interval));
  }
}

/** 订阅盘点：启用的支出类周期规则折算月度合计；按月去重 */
export function subscriptionAuditDrafts(
  rules: RuleLike[],
  periodKey: string,
): InsightDraft[] {
  const expenseRules = rules.filter(
    (rule) => rule.enabled === 1 && rule.type === 'expense',
  );
  if (expenseRules.length < 2) return [];
  const total = expenseRules.reduce(
    (sum, rule) => sum + monthlyEquivalentCents(rule),
    0,
  );
  return [
    {
      type: 'subscription_audit',
      dedupKey: `subscription_audit:${periodKey}`,
      periodKey,
      title: '订阅盘点',
      body: insightsCopy.subscription(
        formatCentsWithSymbol(total),
        expenseRules.length,
      ),
      data: { monthlyCents: total, count: expenseRules.length },
      actionRoute: '/recurring',
      tier: 1,
    },
  ];
}

/* --------------------------- savings_rate_change --------------------------- */

export type SavingsInput = {
  /** 本月（进行中）收入/支出（本位币分） */
  current: { income: number; expense: number };
  /** 前三个完整月 */
  trailing: { income: number; expense: number }[];
};

/** 储蓄率变化：本月 vs 前三月均值，偏差 ≥10 个百分点且两侧都有收入 */
export function savingsRateDrafts(
  input: SavingsInput,
  periodKey: string,
): InsightDraft[] {
  const rate = (m: { income: number; expense: number }) =>
    m.income > 0 ? ((m.income - m.expense) / m.income) * 100 : null;
  const currentRate = rate(input.current);
  const past = input.trailing.filter((m) => (rate(m) ?? null) !== null);
  if (currentRate === null || past.length < 2) return [];
  const avg =
    past.reduce((sum, m) => sum + (rate(m) ?? 0), 0) / past.length;
  const delta = currentRate - avg;
  if (Math.abs(delta) < 10) return [];
  const isUp = delta > 0;
  return [
    {
      type: 'savings_rate_change',
      dedupKey: `savings_rate_change:${periodKey}:${isUp ? 'up' : 'down'}`,
      periodKey,
      title: '储蓄率变化',
      body: isUp
        ? insightsCopy.savingsUp(Math.round(currentRate), Math.round(Math.abs(delta)))
        : insightsCopy.savingsDown(Math.round(currentRate), Math.round(Math.abs(delta))),
      data: { rate: Math.round(currentRate), deltaPct: Math.round(delta) },
      actionRoute: '/stats',
      tier: 1,
    },
  ];
}

/* ---------------------------- upcoming_recurring --------------------------- */

export type UpcomingInput = {
  todayKey: string;
  /** 未来 3 天内将触发的规则（含今天） */
  rules: Array<RuleLike & { nextRunDate: string }>;
};

/** 即将扣款：未来 3 天的周期记账合计；dedup 跟随这批 nextRunDate */
export function upcomingRecurringDraft(input: UpcomingInput): InsightDraft[] {
  const within3d = input.rules.filter(
    (rule) =>
      rule.enabled === 1 &&
      rule.nextRunDate >= input.todayKey &&
      rule.nextRunDate <= addDays(input.todayKey, 3),
  );
  if (within3d.length === 0) return [];
  const total = within3d.reduce((sum, rule) => sum + rule.amount, 0);
  const needConfirm = within3d.filter((rule) => rule.autoCreate !== 1).length;
  const dateKey = within3d.map((rule) => rule.nextRunDate).sort().join(',');
  return [
    {
      type: 'upcoming_recurring',
      dedupKey: `upcoming_recurring:${dateKey}`,
      periodKey: input.todayKey.slice(0, 7),
      title: '即将扣款',
      body: insightsCopy.upcoming(
        within3d.length,
        formatCentsWithSymbol(total),
        needConfirm,
      ),
      data: { count: within3d.length, totalCents: total, needConfirm },
      actionRoute: '/recurring',
      tier: 1,
    },
  ];
}

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
