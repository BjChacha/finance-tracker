import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { accounts, type Account, type AccountType } from '@/db/schema';
import { newId } from '@/lib/id';

/** 账户 + SQL 聚合余额（分） */
export type AccountWithBalance = Account & { balance: number };

/**
 * 一次查询算出全部账户余额：
 * initial_balance + Σincome − Σexpense − Σ(转出 amount+fee) + Σ转入 amount
 */
export async function listAccountsWithBalance(opts?: {
  includeArchived?: boolean;
}): Promise<AccountWithBalance[]> {
  const rows: AccountWithBalance[] = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      icon: accounts.icon,
      color: accounts.color,
      initialBalance: accounts.initialBalance,
      currency: accounts.currency,
      includeInTotal: accounts.includeInTotal,
      sortOrder: accounts.sortOrder,
      archived: accounts.archived,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
      balance: sql<number>`
        ${accounts.initialBalance}
        + COALESCE((
            SELECT SUM(CASE
              WHEN t.type = 'income' THEN t.amount
              WHEN t.type = 'expense' THEN -t.amount
              WHEN t.type = 'transfer' THEN -(t.amount + t.fee)
              ELSE 0 END)
            FROM transactions t WHERE t.account_id = ${accounts.id}
          ), 0)
        + COALESCE((
            SELECT SUM(t.amount) FROM transactions t
            WHERE t.to_account_id = ${accounts.id} AND t.type = 'transfer'
          ), 0)
      `.mapWith(Number),
    })
    .from(accounts)
    .where(opts?.includeArchived ? undefined : eq(accounts.archived, 0))
    .orderBy(asc(accounts.sortOrder), asc(accounts.createdAt));
  return rows;
}

/** 总资产（分）：includeInTotal=1 且未归档账户余额之和 */
export function totalAssets(list: AccountWithBalance[]): number {
  return list
    .filter((a) => a.includeInTotal === 1 && a.archived === 0)
    .reduce((sum, a) => sum + a.balance, 0);
}

export type AccountInput = {
  name: string;
  type: AccountType;
  icon: string;
  color: string;
  initialBalance: number;
  includeInTotal: boolean;
};

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
      includeInTotal: input.includeInTotal ? 1 : 0,
      updatedAt: Date.now(),
    })
    .where(eq(accounts.id, id));
}

export async function archiveAccount(id: string): Promise<void> {
  await db.update(accounts).set({ archived: 1, updatedAt: Date.now() }).where(eq(accounts.id, id));
}
