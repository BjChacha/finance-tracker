import { and, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '@/db/client';
import { budgets, categories, transactions, type Budget } from '@/db/schema';
import { monthRange, todayKey } from '@/lib/date';
import { newId } from '@/lib/id';
import { budgetLevel, budgetPct, dailyAvailable, type BudgetLevel } from './transform';

export type BudgetListItem = Budget & {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
};

/** 全部预算（含停用），总预算排最前，其余按创建时间 */
export async function listBudgets(): Promise<BudgetListItem[]> {
  return db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      amount: budgets.amount,
      alertPct: budgets.alertPct,
      enabled: budgets.enabled,
      createdAt: budgets.createdAt,
      updatedAt: budgets.updatedAt,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
    })
    .from(budgets)
    .leftJoin(categories, eq(budgets.categoryId, categories.id))
    .orderBy(sql`${budgets.categoryId} IS NOT NULL`, budgets.createdAt);
}

export type BudgetInput = {
  /** null = 月度总预算 */
  categoryId: string | null;
  /** 每月额度（分） */
  amount: number;
  /** 提醒阈值（%） */
  alertPct: number;
};

/**
 * 每分类唯一 upsert。注意：SQLite 唯一索引不约束 NULL（多行 categoryId=NULL 可共存），
 * 所以总预算（categoryId=null）的唯一性靠先查后写保证，分类预算也走同一路径保持一致。
 */
export async function upsertBudget(input: BudgetInput): Promise<string> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error('额度必须为正数');
  }
  const cond =
    input.categoryId === null ? isNull(budgets.categoryId) : eq(budgets.categoryId, input.categoryId);
  const [existing] = await db.select({ id: budgets.id }).from(budgets).where(cond).limit(1);
  const now = Date.now();
  if (existing) {
    await db
      .update(budgets)
      .set({ amount: input.amount, alertPct: input.alertPct, enabled: 1, updatedAt: now })
      .where(eq(budgets.id, existing.id));
    return existing.id;
  }
  const id = newId();
  await db.insert(budgets).values({
    id,
    categoryId: input.categoryId,
    amount: input.amount,
    alertPct: input.alertPct,
    enabled: 1,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function removeBudget(id: string): Promise<void> {
  await db.delete(budgets).where(eq(budgets.id, id));
}

export type BudgetStatusItem = {
  budgetId: string;
  /** null = 总预算 */
  categoryId: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  /** 每月额度（分） */
  amount: number;
  alertPct: number;
  /** 当月已用（分） */
  spent: number;
  /** 剩余（分），可为负 */
  remaining: number;
  /** 进度 %（一位小数，可超 100） */
  pct: number;
  /** 日均可用（分/天） */
  daily: number;
  level: BudgetLevel;
};

export type BudgetStatus = {
  monthKey: string;
  total: BudgetStatusItem | null;
  categories: BudgetStatusItem[];
};

const parentCat = alias(categories, 'parent_cat');

/**
 * 当月预算执行情况（仅启用预算）：
 * - 分类预算：expense 交易按分类汇总，子分类消费归并计入父分类预算
 * - 总预算：当月全部支出（expense + 转账 fee），口径与 monthSummary 一致
 */
export async function budgetStatus(monthKey: string): Promise<BudgetStatus> {
  const [start, end] = monthRange(monthKey);
  const inMonth = and(
    sql`${transactions.dateKey} >= ${start}`,
    sql`${transactions.dateKey} <= ${end}`,
  );

  const budgetRows = await db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      amount: budgets.amount,
      alertPct: budgets.alertPct,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
    })
    .from(budgets)
    .leftJoin(categories, eq(budgets.categoryId, categories.id))
    .where(eq(budgets.enabled, 1))
    .orderBy(sql`${budgets.categoryId} IS NOT NULL`, budgets.createdAt);

  // 按一级分类归并的当月支出（子分类计入父分类）
  const groupId = sql<string>`COALESCE(${parentCat.id}, ${categories.id})`;
  const spentRows = await db
    .select({
      categoryId: groupId,
      total: sql<number>`SUM(${transactions.amount})`.mapWith(Number),
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCat, eq(categories.parentId, parentCat.id))
    .where(and(inMonth, eq(transactions.type, 'expense')))
    .groupBy(groupId);
  const spentByCat = new Map(spentRows.map((r) => [r.categoryId, r.total]));

  // 总支出：expense 金额 + transfer 手续费（与 monthSummary 同口径）
  const [totalRow] = await db
    .select({
      expense: sql<number>`COALESCE(SUM(CASE
        WHEN ${transactions.type} = 'expense' THEN ${transactions.amount}
        WHEN ${transactions.type} = 'transfer' THEN ${transactions.fee}
        ELSE 0 END), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(inMonth);
  const totalSpent = totalRow?.expense ?? 0;

  const today = todayKey();
  const build = (
    row: (typeof budgetRows)[number],
    spent: number,
  ): BudgetStatusItem => {
    const remaining = row.amount - spent;
    return {
      budgetId: row.id,
      categoryId: row.categoryId,
      name: row.categoryId === null ? '总预算' : (row.categoryName ?? ''),
      icon: row.categoryIcon,
      color: row.categoryColor,
      amount: row.amount,
      alertPct: row.alertPct,
      spent,
      remaining,
      pct: budgetPct(spent, row.amount),
      daily: dailyAvailable(remaining, monthKey, today),
      level: budgetLevel(spent, row.amount, row.alertPct),
    };
  };

  let total: BudgetStatusItem | null = null;
  const categoryItems: BudgetStatusItem[] = [];
  for (const row of budgetRows) {
    if (row.categoryId === null) {
      total = build(row, totalSpent);
    } else {
      categoryItems.push(build(row, spentByCat.get(row.categoryId) ?? 0));
    }
  }
  return { monthKey, total, categories: categoryItems };
}
