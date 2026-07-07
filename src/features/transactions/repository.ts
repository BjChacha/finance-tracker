import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '@/db/client';
import { accounts, categories, transactions, type TransactionType } from '@/db/schema';
import { monthRange } from '@/lib/date';
import { toDateKey } from '@/lib/date';
import { newId } from '@/lib/id';

export type TxFilters = {
  /** 'YYYY-MM' */
  monthKey: string;
  type?: TransactionType;
  accountId?: string;
  categoryId?: string;
};

export type TxListItem = {
  id: string;
  type: TransactionType;
  amount: number;
  fee: number;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  date: number;
  dateKey: string;
  note: string;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  accountName: string | null;
  toAccountName: string | null;
};

const toAccounts = alias(accounts, 'to_accounts');

/** 按月 + 可选筛选查询明细，date desc */
export async function listTransactions(filters: TxFilters): Promise<TxListItem[]> {
  const [start, end] = monthRange(filters.monthKey);
  const conditions = [
    sql`${transactions.dateKey} >= ${start}`,
    sql`${transactions.dateKey} <= ${end}`,
  ];
  if (filters.type) conditions.push(eq(transactions.type, filters.type));
  if (filters.accountId) conditions.push(eq(transactions.accountId, filters.accountId));
  if (filters.categoryId) conditions.push(eq(transactions.categoryId, filters.categoryId));

  return db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      fee: transactions.fee,
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
      categoryId: transactions.categoryId,
      date: transactions.date,
      dateKey: transactions.dateKey,
      note: transactions.note,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      accountName: accounts.name,
      toAccountName: toAccounts.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(toAccounts, eq(transactions.toAccountId, toAccounts.id))
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.createdAt));
}

export type MonthSummary = { income: number; expense: number };

/** 本月收入/支出（SQL 聚合；transfer 不计入，transfer 的 fee 计入支出） */
export async function monthSummary(monthKey: string): Promise<MonthSummary> {
  const [start, end] = monthRange(monthKey);
  const [row] = await db
    .select({
      income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`.mapWith(
        Number,
      ),
      expense: sql<number>`COALESCE(SUM(CASE
        WHEN ${transactions.type} = 'expense' THEN ${transactions.amount}
        WHEN ${transactions.type} = 'transfer' THEN ${transactions.fee}
        ELSE 0 END), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(and(sql`${transactions.dateKey} >= ${start}`, sql`${transactions.dateKey} <= ${end}`));
  return row ?? { income: 0, expense: 0 };
}

export async function getTransactionById(id: string): Promise<TxListItem | null> {
  const rows = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      fee: transactions.fee,
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
      categoryId: transactions.categoryId,
      date: transactions.date,
      dateKey: transactions.dateKey,
      note: transactions.note,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      accountName: accounts.name,
      toAccountName: toAccounts.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(toAccounts, eq(transactions.toAccountId, toAccounts.id))
    .where(eq(transactions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export type TxInput = {
  type: TransactionType;
  /** 分，>0 */
  amount: number;
  /** 分，仅 transfer 使用 */
  fee?: number;
  accountId: string;
  toAccountId?: string | null;
  categoryId?: string | null;
  /** Unix 毫秒 */
  date: number;
  note?: string;
};

/** 校验并归一化输入；不合法抛错 */
function normalize(input: TxInput) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error('金额必须为正数');
  }
  const fee = input.fee ?? 0;
  if (!Number.isSafeInteger(fee) || fee < 0) throw new Error('手续费不能为负');
  if (input.type === 'transfer') {
    if (!input.toAccountId) throw new Error('转账必须指定转入账户');
    if (input.toAccountId === input.accountId) throw new Error('转出与转入账户不能相同');
    return { ...input, categoryId: null, fee, dateKey: toDateKey(input.date) };
  }
  if (!input.categoryId) throw new Error('请选择分类');
  return { ...input, toAccountId: null, fee: 0, dateKey: toDateKey(input.date) };
}

export async function createTransaction(input: TxInput): Promise<string> {
  const n = normalize(input);
  const now = Date.now();
  const id = newId();
  await db.insert(transactions).values({
    id,
    type: n.type,
    amount: n.amount,
    fee: n.fee,
    accountId: n.accountId,
    toAccountId: n.toAccountId ?? null,
    categoryId: n.categoryId ?? null,
    date: n.date,
    dateKey: n.dateKey,
    note: n.note ?? '',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateTransaction(id: string, input: TxInput): Promise<void> {
  const n = normalize(input);
  await db
    .update(transactions)
    .set({
      type: n.type,
      amount: n.amount,
      fee: n.fee,
      accountId: n.accountId,
      toAccountId: n.toAccountId ?? null,
      categoryId: n.categoryId ?? null,
      date: n.date,
      dateKey: n.dateKey,
      note: n.note ?? '',
      updatedAt: Date.now(),
    })
    .where(eq(transactions.id, id));
}

export async function removeTransaction(id: string): Promise<void> {
  await db.delete(transactions).where(eq(transactions.id, id));
}
