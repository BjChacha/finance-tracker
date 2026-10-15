import { and, asc, eq, or, sql } from 'drizzle-orm';
import { normalizeAccountType } from '@/db/account-types';
import { db, withTransaction } from '@/db/client';
import {
  accounts,
  importMappings,
  recurringRules,
  transactions,
  type Account,
  type AccountType,
} from '@/db/schema';
import { ensureAdjustmentCategory } from '@/features/categories/repository';
import { createTransaction } from '@/features/transactions/repository';
import { newId } from '@/lib/id';
import { RATE_SCALE, toBaseCents } from '@/lib/money';
import { todayKey } from '@/lib/date';
import { planAdjustment } from './adjustment';

/** 账户 + SQL 聚合余额（分） */
export type AccountWithBalance = Account & { balance: number };

/**
 * 一次查询算出全部账户余额（该账户币种下的分）：
 * initial_balance + Σincome − Σexpense − Σ(转出 amount+fee) + Σ转入(to_amount)
 * 注：多币种下账户余额按账户自身币种；totalAssets 再用 rateToBase 折算到本位币。
 */
export async function listAccountsWithBalance(opts?: {
  includeArchived?: boolean;
  asOfDate?: string;
}): Promise<AccountWithBalance[]> {
  const asOfDate = opts?.asOfDate ?? todayKey();
  const rows: AccountWithBalance[] = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      icon: accounts.icon,
      color: accounts.color,
      initialBalance: accounts.initialBalance,
      currency: accounts.currency,
      rateToBase: accounts.rateToBase,
      includeInTotal: accounts.includeInTotal,
      sortOrder: accounts.sortOrder,
      archived: accounts.archived,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
      // 注意：关联子查询里必须写 ${accounts}.id（带表限定）。
      // 单表 select 时 drizzle 会把 ${accounts.id} 渲染成不带限定的 "id"，
      // 在子查询作用域内被解析为 transactions 自己的列，聚合恒为 0。
      balance: sql<number>`
        ${accounts.initialBalance}
        + COALESCE((
            SELECT SUM(CASE
              WHEN t.type = 'income' THEN t.amount
              WHEN t.type = 'expense' THEN -t.amount
              WHEN t.type = 'transfer' THEN -(t.amount + t.fee)
              ELSE 0 END)
            FROM transactions t WHERE t.account_id = ${accounts}.id AND t.date_key <= ${asOfDate}
          ), 0)
        + COALESCE((
            SELECT SUM(COALESCE(t.to_amount, t.amount)) FROM transactions t
            WHERE t.to_account_id = ${accounts}.id AND t.type = 'transfer' AND t.date_key <= ${asOfDate}
          ), 0)
      `.mapWith(Number),
    })
    .from(accounts)
    .where(opts?.includeArchived ? undefined : eq(accounts.archived, 0))
    .orderBy(asc(accounts.sortOrder), asc(accounts.createdAt));
  return rows.map((row) => ({ ...row, type: normalizeAccountType(row.type) }));
}

/** 总资产（本位币分）：各账户余额 × rateToBase 折算后求和（includeInTotal=1 且未归档） */
export function totalAssets(list: AccountWithBalance[]): number {
  return list
    .filter((a) => a.includeInTotal === 1 && a.archived === 0)
    .reduce((sum, a) => sum + toBaseCents(a.balance, a.rateToBase), 0);
}

export type AccountInput = {
  name: string;
  type: AccountType;
  icon: string;
  color: string;
  initialBalance: number;
  includeInTotal: boolean;
  /** 账户币种 ISO code，默认 CNY */
  currency?: string;
  /** 相对本位币当前汇率 ×1e6，默认 1.0（本位币账户） */
  rateToBase?: number;
};

export type AccountDetailsInput = Pick<
  AccountInput,
  'name' | 'type' | 'icon' | 'color' | 'includeInTotal'
>;

export async function createAccount(input: AccountInput): Promise<string> {
  const now = Date.now();
  const id = newId();
  await db.insert(accounts).values({
    id,
    name: input.name,
    type: input.type,
    icon: input.icon,
    color: input.color,
    initialBalance: input.initialBalance,
    currency: input.currency ?? 'CNY',
    rateToBase: input.rateToBase ?? RATE_SCALE,
    includeInTotal: input.includeInTotal ? 1 : 0,
    sortOrder: now,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateAccount(id: string, input: AccountInput): Promise<void> {
  await db
    .update(accounts)
    .set({
      name: input.name,
      type: input.type,
      icon: input.icon,
      color: input.color,
      initialBalance: input.initialBalance,
      currency: input.currency ?? 'CNY',
      rateToBase: input.rateToBase ?? RATE_SCALE,
      includeInTotal: input.includeInTotal ? 1 : 0,
      updatedAt: Date.now(),
    })
    .where(eq(accounts.id, id));
}

export async function updateAccountDetails(
  id: string,
  input: AccountDetailsInput,
): Promise<void> {
  await db
    .update(accounts)
    .set({
      name: input.name,
      type: input.type,
      icon: input.icon,
      color: input.color,
      includeInTotal: input.includeInTotal ? 1 : 0,
      updatedAt: Date.now(),
    })
    .where(eq(accounts.id, id));
}

export async function archiveAccount(id: string): Promise<void> {
  await db.update(accounts).set({ archived: 1, updatedAt: Date.now() }).where(eq(accounts.id, id));
}

export async function deleteAccountCascade(id: string): Promise<void> {
  await withTransaction(async () => {
    await db
      .delete(transactions)
      .where(or(eq(transactions.accountId, id), eq(transactions.toAccountId, id)));
    await db
      .delete(recurringRules)
      .where(or(eq(recurringRules.accountId, id), eq(recurringRules.toAccountId, id)));
    await db
      .delete(importMappings)
      .where(and(eq(importMappings.kind, 'account'), eq(importMappings.targetId, id)));
    await db.delete(accounts).where(eq(accounts.id, id));
  });
}

/**
 * 调整账户当前余额到 actualCents（立即落库）。
 * - 记交易：按差额方向新增一笔 income/expense 交易（分类「补记漏记」），余额经现有公式自动更新。
 * - 不记交易：把差额并入 initialBalance。
 * 差额为 0 时不做任何操作。
 */
export async function adjustAccountBalance(
  account: AccountWithBalance,
  actualCents: number,
  recordTx: boolean,
): Promise<void> {
  const plan = planAdjustment(account.balance, actualCents);
  if (plan.scope === null) return;
  if (recordTx) {
    const categoryId = await ensureAdjustmentCategory(plan.scope);
    await createTransaction({
      type: plan.scope,
      amount: plan.amount,
      accountId: account.id,
      categoryId,
      date: Date.now(),
      currency: account.currency,
      exchangeRate: account.rateToBase,
      note: '余额调整（补记漏记）',
    });
    return;
  }
  await updateAccount(account.id, {
    name: account.name,
    type: account.type,
    icon: account.icon,
    color: account.color,
    initialBalance: account.initialBalance + plan.delta,
    includeInTotal: account.includeInTotal === 1,
    currency: account.currency,
    rateToBase: account.rateToBase,
  });
}
