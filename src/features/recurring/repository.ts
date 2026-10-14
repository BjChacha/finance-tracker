import { and, asc, desc, eq, getTableColumns, lte, or, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db, withTransaction } from '@/db/client';
import {
  accounts,
  categories,
  recurringRules,
  transactions,
  type NewTransaction,
  type RecurringFrequency,
  type RecurringRule,
  type TransactionType,
} from '@/db/schema';
import { dayjs, nextRunDate, todayKey } from '@/lib/date';
import { newId } from '@/lib/id';
import { RATE_SCALE } from '@/lib/money';
import { advanceOneStep, alignToAnchor } from './transform';

const toAccounts = alias(accounts, 'to_accounts');

export type RecurringListItem = RecurringRule & {
  accountName: string | null;
  toAccountName: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
};

const listSelection = {
  ...getTableColumns(recurringRules),
  accountName: accounts.name,
  toAccountName: toAccounts.name,
  categoryName: categories.name,
  categoryIcon: categories.icon,
};

/** 全部规则（join 账户/分类名），启用在前，按下次运行日期排序 */
export async function listRules(): Promise<RecurringListItem[]> {
  return db
    .select(listSelection)
    .from(recurringRules)
    .leftJoin(accounts, eq(recurringRules.accountId, accounts.id))
    .leftJoin(toAccounts, eq(recurringRules.toAccountId, toAccounts.id))
    .leftJoin(categories, eq(recurringRules.categoryId, categories.id))
    .orderBy(desc(recurringRules.enabled), asc(recurringRules.nextRunDate));
}

/** 待确认列表：autoCreate=0 且已到期（nextRunDate <= today 且未超 endDate） */
export async function listPendingRules(today: string): Promise<RecurringListItem[]> {
  return db
    .select(listSelection)
    .from(recurringRules)
    .leftJoin(accounts, eq(recurringRules.accountId, accounts.id))
    .leftJoin(toAccounts, eq(recurringRules.toAccountId, toAccounts.id))
    .leftJoin(categories, eq(recurringRules.categoryId, categories.id))
    .where(
      and(
        eq(recurringRules.enabled, 1),
        eq(recurringRules.autoCreate, 0),
        lte(recurringRules.nextRunDate, today),
        or(
          isNull(recurringRules.endDate),
          sql`${recurringRules.nextRunDate} <= ${recurringRules.endDate}`,
        ),
      ),
    )
    .orderBy(asc(recurringRules.nextRunDate));
}

export type RecurringInput = {
  name: string;
  type: TransactionType;
  /** 分，>0 */
  amount: number;
  accountId: string;
  toAccountId: string | null;
  categoryId: string;
  note: string;
  frequency: RecurringFrequency;
  interval: number;
  anchor: number;
  startDate: string;
  endDate: string | null;
  autoCreate: boolean;
};

export function validateRecurringInput(input: RecurringInput): void {
  if (!input.name.trim()) throw new Error('请输入名称');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error('金额必须为正数');
  if (!Number.isSafeInteger(input.interval) || input.interval < 1) throw new Error('间隔必须为正整数');
  if (!input.categoryId) throw new Error('请选择分类');
  if (input.type === 'transfer') {
    if (!input.toAccountId) throw new Error('转账必须指定转入账户');
    if (input.toAccountId === input.accountId) throw new Error('转出与转入账户不能相同');
  }
  if (input.endDate !== null && input.endDate < input.startDate) {
    throw new Error('结束日期不能早于开始日期');
  }
}

function toRow(input: RecurringInput) {
  return {
    name: input.name.trim(),
    type: input.type,
    amount: input.amount,
    accountId: input.accountId,
    toAccountId: input.type === 'transfer' ? input.toAccountId : null,
    categoryId: input.categoryId,
    note: input.note.trim(),
    frequency: input.frequency,
    interval: input.interval,
    anchor: input.anchor,
    startDate: input.startDate,
    endDate: input.endDate,
    autoCreate: input.autoCreate ? 1 : 0,
  };
}

export async function createRule(input: RecurringInput): Promise<string> {
  validateRecurringInput(input);
  // 首个 nextRunDate = startDate 与锚点对齐后的第一个日期（>= startDate）。
  // 例：startDate=2026-07-07(周二) + weekly anchor=1(周一) → 2026-07-13；
  //     startDate=2026-07-07 + monthly anchor=1 → 2026-08-01（本月 1 号已过）。
  const next = alignToAnchor(input.startDate, input.frequency, input.anchor);
  const id = newId();
  const now = Date.now();
  await db.insert(recurringRules).values({
    id,
    ...toRow(input),
    nextRunDate: next,
    lastRunDate: null,
    enabled: 1,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateRule(id: string, input: RecurringInput): Promise<void> {
  validateRecurringInput(input);
  const [rule] = await db.select().from(recurringRules).where(eq(recurringRules.id, id)).limit(1);
  if (!rule) throw new Error('规则不存在');
  // 重新对齐 nextRunDate；若规则已运行过，推进到 lastRunDate 之后，避免 catchUp 重复补历史账
  let next = alignToAnchor(input.startDate, input.frequency, input.anchor);
  let guard = 0;
  while (rule.lastRunDate !== null && next <= rule.lastRunDate && guard++ < 1000) {
    next = nextRunDate(next, input.frequency, input.interval, input.anchor);
  }
  await db
    .update(recurringRules)
    .set({ ...toRow(input), nextRunDate: next, updatedAt: Date.now() })
    .where(eq(recurringRules.id, id));
}

export async function removeRule(id: string): Promise<void> {
  await withTransaction(async () => {
    // 历史交易保留，仅清除回链
    await db
      .update(transactions)
      .set({ recurringRuleId: null })
      .where(eq(transactions.recurringRuleId, id));
    await db.delete(recurringRules).where(eq(recurringRules.id, id));
  });
}

export async function toggleRule(id: string, enabled: boolean): Promise<void> {
  const [rule] = await db.select().from(recurringRules).where(eq(recurringRules.id, id)).limit(1);
  if (!rule) return;
  const patch: Partial<typeof recurringRules.$inferInsert> = {
    enabled: enabled ? 1 : 0,
    updatedAt: Date.now(),
  };
  if (enabled) {
    // 停用许久后重新启用：指针若已落在过去，从今天重新对齐，避免补出停用期间的一堆历史账
    const today = todayKey();
    if (rule.nextRunDate < today) {
      patch.nextRunDate = alignToAnchor(today, rule.frequency, rule.anchor);
    }
  }
  await db.update(recurringRules).set(patch).where(eq(recurringRules.id, id));
}

/** 由规则生成某运行日的交易行（date 固定为当天 12:00 本地，dateKey=运行日） */
export function ruleToTxValues(rule: RecurringRule, runDate: string): NewTransaction {
  const now = Date.now();
  // 周期规则暂不支持多币种：生成交易按本位币 CNY 记账
  return {
    id: newId(),
    type: rule.type,
    amount: rule.amount,
    fee: 0,
    currency: 'CNY',
    exchangeRate: RATE_SCALE,
    amountBaseCents: rule.amount,
    accountId: rule.accountId,
    toAccountId: rule.type === 'transfer' ? rule.toAccountId : null,
    toAmount: rule.type === 'transfer' ? rule.amount : null,
    categoryId: rule.categoryId,
    date: dayjs(runDate).hour(12).minute(0).second(0).millisecond(0).valueOf(),
    dateKey: runDate,
    note: rule.note,
    recurringRuleId: rule.id,
    createdAt: now,
    updatedAt: now,
  };
}

/** 同规则同 dateKey 已存在交易则视为已生成（幂等锚点） */
export async function hasRunTransaction(ruleId: string, dateKey: string): Promise<boolean> {
  const rows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.recurringRuleId, ruleId), eq(transactions.dateKey, dateKey)))
    .limit(1);
  return rows.length > 0;
}

/** 待确认"记入"：生成 nextRunDate 当期交易（幂等）并推进一步 */
export async function confirmPending(ruleId: string): Promise<void> {
  await withTransaction(async () => {
    const [rule] = await db
      .select()
      .from(recurringRules)
      .where(eq(recurringRules.id, ruleId))
      .limit(1);
    if (!rule) return;
    const runDate = rule.nextRunDate;
    if (!(await hasRunTransaction(ruleId, runDate))) {
      await db.insert(transactions).values(ruleToTxValues(rule, runDate));
    }
    const { nextRun, expired } = advanceOneStep(rule);
    await db
      .update(recurringRules)
      .set({
        nextRunDate: nextRun,
        lastRunDate: runDate,
        enabled: expired ? 0 : rule.enabled,
        updatedAt: Date.now(),
      })
      .where(eq(recurringRules.id, ruleId));
  });
}

/** 待确认"跳过"：不生成交易，仅推进一步 */
export async function skipPending(ruleId: string): Promise<void> {
  const [rule] = await db
    .select()
    .from(recurringRules)
    .where(eq(recurringRules.id, ruleId))
    .limit(1);
  if (!rule) return;
  const { nextRun, expired } = advanceOneStep(rule);
  await db
    .update(recurringRules)
    .set({
      nextRunDate: nextRun,
      enabled: expired ? 0 : rule.enabled,
      updatedAt: Date.now(),
    })
    .where(eq(recurringRules.id, ruleId));
}
