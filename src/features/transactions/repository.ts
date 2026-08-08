import { and, desc, eq, lt, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '@/db/client';
import { accounts, categories, projects, transactions, type TransactionType } from '@/db/schema';
import { zh } from '@/i18n/zh';
import { monthRange } from '@/lib/date';
import { toDateKey } from '@/lib/date';
import { newId } from '@/lib/id';
import { RATE_SCALE, toBaseCents } from '@/lib/money';
import { parseTransactionSearchQuery, type TransactionSearchToken } from './search-query';

export type TxFilters = {
  /** 'YYYY-MM'; omit to list all-time transactions */
  monthKey?: string;
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
  /** 交易币种 ISO code */
  currency: string;
  /** 相对本位币汇率 ×1e6 */
  exchangeRate: number;
  /** 本位币金额（分） */
  amountBaseCents: number;
  /** 仅 transfer：转入侧金额（目标币种，分） */
  toAmount: number | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  parentCategoryName: string | null;
  projectId: string | null;
  projectName: string | null;
  projectIcon: string | null;
  projectColor: string | null;
  accountName: string | null;
  toAccountName: string | null;
};

const toAccounts = alias(accounts, 'to_accounts');
const parentCategories = alias(categories, 'parent_categories');

const txSelect = {
  id: transactions.id,
  type: transactions.type,
  amount: transactions.amount,
  fee: transactions.fee,
  currency: transactions.currency,
  exchangeRate: transactions.exchangeRate,
  amountBaseCents: transactions.amountBaseCents,
  toAmount: transactions.toAmount,
  accountId: transactions.accountId,
  toAccountId: transactions.toAccountId,
  categoryId: transactions.categoryId,
  date: transactions.date,
  dateKey: transactions.dateKey,
  note: transactions.note,
  categoryName: categories.name,
  categoryIcon: categories.icon,
  categoryColor: categories.color,
  parentCategoryName: parentCategories.name,
  projectId: transactions.projectId,
  projectName: projects.name,
  projectIcon: projects.icon,
  projectColor: projects.color,
  accountName: accounts.name,
  toAccountName: toAccounts.name,
};

/** 按月（或全部时间）+ 可选筛选查询明细，date desc */
export async function listTransactions(filters: TxFilters): Promise<TxListItem[]> {
  const conditions: SQL[] = [];
  if (filters.monthKey) {
    const [start, end] = monthRange(filters.monthKey);
    conditions.push(sql`${transactions.dateKey} >= ${start}`);
    conditions.push(sql`${transactions.dateKey} <= ${end}`);
  }
  if (filters.type) conditions.push(eq(transactions.type, filters.type));
  if (filters.accountId) conditions.push(eq(transactions.accountId, filters.accountId));
  if (filters.categoryId) conditions.push(eq(transactions.categoryId, filters.categoryId));

  return db
    .select(txSelect)
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(toAccounts, eq(transactions.toAccountId, toAccounts.id))
    .leftJoin(projects, eq(transactions.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.createdAt));
}

/** 最近 N 笔交易（跨月、全局，date desc）—— 首页「最近交易」用 */
export async function listRecentTransactions(limit: number): Promise<TxListItem[]> {
  return db
    .select(txSelect)
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(toAccounts, eq(transactions.toAccountId, toAccounts.id))
    .leftJoin(projects, eq(transactions.projectId, projects.id))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit);
}

export type TransactionSearchCursor = {
  date: number;
  createdAt: number;
  id: string;
};

export type TransactionSearchInput = {
  query: string;
  cursor?: TransactionSearchCursor | null;
  pageSize?: number;
};

export type TransactionSearchPage = {
  items: TxListItem[];
  nextCursor: TransactionSearchCursor | null;
};

const DEFAULT_SEARCH_PAGE_SIZE = 50;
const MAX_SEARCH_PAGE_SIZE = 100;

function likeCondition(field: SQLWrapper, pattern: string): SQL {
  return sql`lower(coalesce(${field}, '')) LIKE ${pattern} ESCAPE '~'`;
}

function tokenCondition(token: TransactionSearchToken): SQL {
  if (token.kind === 'amount') {
    const amountText = sql<string>`printf('%d.%02d', ${transactions.amount} / 100, ${transactions.amount} % 100)`;
    return sql`${amountText} LIKE ${`${token.value}%`} ESCAPE '~'`;
  }

  const typeLabel = sql<string>`CASE ${transactions.type}
    WHEN 'expense' THEN ${`${zh.tx.expense} expense`}
    WHEN 'income' THEN ${`${zh.tx.income} income`}
    WHEN 'transfer' THEN ${`${zh.tx.transfer} transfer`}
    ELSE ''
  END`;
  return or(
    likeCondition(transactions.note, token.likePattern),
    likeCondition(categories.name, token.likePattern),
    likeCondition(parentCategories.name, token.likePattern),
    likeCondition(accounts.name, token.likePattern),
    likeCondition(toAccounts.name, token.likePattern),
    likeCondition(projects.name, token.likePattern),
    likeCondition(typeLabel, token.likePattern),
  )!;
}

function cursorCondition(cursor: TransactionSearchCursor): SQL {
  return or(
    lt(transactions.date, cursor.date),
    and(eq(transactions.date, cursor.date), lt(transactions.createdAt, cursor.createdAt)),
    and(
      eq(transactions.date, cursor.date),
      eq(transactions.createdAt, cursor.createdAt),
      lt(transactions.id, cursor.id),
    ),
  )!;
}

/** Search all transaction history with AND-combined tokens and stable keyset pagination. */
export async function searchTransactions({
  query,
  cursor = null,
  pageSize = DEFAULT_SEARCH_PAGE_SIZE,
}: TransactionSearchInput): Promise<TransactionSearchPage> {
  const { tokens } = parseTransactionSearchQuery(query);
  if (tokens.length === 0) return { items: [], nextCursor: null };

  const normalizedPageSize = Math.max(
    1,
    Math.min(MAX_SEARCH_PAGE_SIZE, Math.trunc(pageSize) || DEFAULT_SEARCH_PAGE_SIZE),
  );
  const conditions = tokens.map(tokenCondition);
  if (cursor) conditions.push(cursorCondition(cursor));

  const rows = await db
    .select({ ...txSelect, createdAt: transactions.createdAt })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(toAccounts, eq(transactions.toAccountId, toAccounts.id))
    .leftJoin(projects, eq(transactions.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
    .limit(normalizedPageSize + 1);

  const pageRows = rows.slice(0, normalizedPageSize);
  const last = pageRows.at(-1);
  return {
    items: pageRows.map(({ createdAt: _createdAt, ...item }) => item),
    nextCursor:
      rows.length > normalizedPageSize && last
        ? { date: last.date, createdAt: last.createdAt, id: last.id }
        : null,
  };
}

export type MonthSummary = { income: number; expense: number };
export type DaySummary = { income: number; expense: number };

// 口径：收入/支出按本位币分；转账不计收支，其手续费（按汇率折本位币）计支出。
const incomeExpr = () =>
  sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amountBaseCents} ELSE 0 END), 0)`.mapWith(
    Number,
  );
const expenseExpr = () =>
  sql<number>`COALESCE(SUM(CASE
    WHEN ${transactions.type} = 'expense' THEN ${transactions.amountBaseCents}
    WHEN ${transactions.type} = 'transfer' THEN CAST(ROUND(${transactions.fee} * ${transactions.exchangeRate} / 1000000.0) AS INTEGER)
    ELSE 0 END), 0)`.mapWith(Number);

/** 本月收入/支出（本位币分；SQL 聚合；transfer 不计入，transfer 的 fee 计入支出） */
export async function monthSummary(monthKey: string): Promise<MonthSummary> {
  const [start, end] = monthRange(monthKey);
  const [row] = await db
    .select({ income: incomeExpr(), expense: expenseExpr() })
    .from(transactions)
    .where(and(sql`${transactions.dateKey} >= ${start}`, sql`${transactions.dateKey} <= ${end}`));
  return row ?? { income: 0, expense: 0 };
}

/** 单日收入/支出（本位币分；规则同 monthSummary：transfer 不计，其 fee 计入支出） */
export async function daySummary(dateKey: string): Promise<DaySummary> {
  const [row] = await db
    .select({ income: incomeExpr(), expense: expenseExpr() })
    .from(transactions)
    .where(eq(transactions.dateKey, dateKey));
  return row ?? { income: 0, expense: 0 };
}

/** 全部时间收入/支出（本位币分；规则同 monthSummary，全表聚合） */
export async function allTimeSummary(): Promise<MonthSummary> {
  const [row] = await db
    .select({ income: incomeExpr(), expense: expenseExpr() })
    .from(transactions);
  return row ?? { income: 0, expense: 0 };
}

export async function getTransactionById(id: string): Promise<TxListItem | null> {
  const rows = db
    .select(txSelect)
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(toAccounts, eq(transactions.toAccountId, toAccounts.id))
    .leftJoin(projects, eq(transactions.projectId, projects.id))
    .where(eq(transactions.id, id))
    .limit(1);
  return (await rows)[0] ?? null;
}

export type TxInput = {
  type: TransactionType;
  /** 分，>0，交易币种下的金额 */
  amount: number;
  /** 分，仅 transfer 使用 */
  fee?: number;
  accountId: string;
  toAccountId?: string | null;
  categoryId?: string | null;
  /** 可选：所属项目 */
  projectId?: string | null;
  /** Unix 毫秒 */
  date: number;
  note?: string;
  /** 交易币种 ISO code，默认 CNY（应与账户币种一致） */
  currency?: string;
  /** 相对本位币汇率 ×1e6，默认 RATE_SCALE（1.0，即本位币） */
  exchangeRate?: number;
  /** 仅 transfer：转入侧金额（目标账户币种，分）。缺省=amount（视同同币种） */
  toAmount?: number;
};

type NormalizedTx = TxInput & {
  fee: number;
  currency: string;
  exchangeRate: number;
  amountBaseCents: number;
  toAmount?: number;
  dateKey: string;
};

/** 校验并归一化输入；不合法抛错。同时计算本位币金额 amountBaseCents。 */
function normalize(input: TxInput): NormalizedTx {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error('金额必须为正数');
  }
  const fee = input.fee ?? 0;
  if (!Number.isSafeInteger(fee) || fee < 0) throw new Error('手续费不能为负');

  const currency = (input.currency ?? 'CNY').trim().toUpperCase() || 'CNY';
  const exchangeRate =
    Number.isSafeInteger(input.exchangeRate) && (input.exchangeRate as number) > 0
      ? (input.exchangeRate as number)
      : RATE_SCALE;
  const amountBaseCents = toBaseCents(input.amount, exchangeRate);

  if (input.type === 'transfer') {
    if (!input.toAccountId) throw new Error('转账必须指定转入账户');
    if (input.toAccountId === input.accountId) throw new Error('转出与转入账户不能相同');
    const toAmount =
      Number.isSafeInteger(input.toAmount) && (input.toAmount as number) > 0
        ? (input.toAmount as number)
        : input.amount;
    return { ...input, categoryId: null, projectId: input.projectId ?? null, fee, currency, exchangeRate, amountBaseCents, toAmount, dateKey: toDateKey(input.date) };
  }
  if (!input.categoryId) throw new Error('请选择分类');
  return { ...input, toAccountId: null, toAmount: undefined, projectId: input.projectId ?? null, fee: 0, currency, exchangeRate, amountBaseCents, dateKey: toDateKey(input.date) };
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
    currency: n.currency,
    exchangeRate: n.exchangeRate,
    amountBaseCents: n.amountBaseCents,
    accountId: n.accountId,
    toAccountId: n.toAccountId ?? null,
    toAmount: n.type === 'transfer' ? (n.toAmount ?? n.amount) : null,
    categoryId: n.categoryId ?? null,
    projectId: n.projectId ?? null,
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
      currency: n.currency,
      exchangeRate: n.exchangeRate,
      amountBaseCents: n.amountBaseCents,
      accountId: n.accountId,
      toAccountId: n.toAccountId ?? null,
      toAmount: n.type === 'transfer' ? (n.toAmount ?? n.amount) : null,
      categoryId: n.categoryId ?? null,
      projectId: n.projectId ?? null,
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
