import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '@/db/client';
import { budgets, categories, transactions, type Budget } from '@/db/schema';
import { periodRange, todayKey, type BudgetPeriod } from '@/lib/date';
import { newId } from '@/lib/id';
import { formatCents } from '@/lib/money';
import { budgetLevel, budgetPct, dailyAvailable, type BudgetLevel } from './transform';

export type BudgetListItem = Budget & {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
};

export type BudgetInput = {
  period: BudgetPeriod;
  /** null = 该周期总预算 */
  categoryId: string | null;
  /** 该周期额度（分） */
  amount: number;
  /** 提醒阈值（%） */
  alertPct: number;
};

export type AllocationSummary = {
  /** 该周期总预算额度（分） */
  totalAmount: number;
  /** 已分配到分类预算的合计（分） */
  allocated: number;
  /** 待分配 = totalAmount - allocated */
  toAllocate: number;
};

/**
 * 由预算行（categoryId/amount）计算信封分配汇总。纯函数，便于单测。
 * 无总预算行（categoryId=null 缺失）返回 null。
 */
export function computeAllocation(
  rows: ReadonlyArray<{ categoryId: string | null; amount: number }>,
): AllocationSummary | null {
  let totalAmount = 0;
  let allocated = 0;
  let hasTotal = false;
  for (const r of rows) {
    if (r.categoryId === null) {
      totalAmount = r.amount;
      hasTotal = true;
    } else {
      allocated += r.amount;
    }
  }
  if (!hasTotal) return null;
  return { totalAmount, allocated, toAllocate: totalAmount - allocated };
}

export type AllocationContext = {
  /** 该周期当前总预算额度；无总预算时为 null */
  totalAmount: number | null;
  /** 除本次待写分类外的其他分类预算合计（分） */
  othersAllocated: number;
};

/**
 * 信封分配校验（纯函数）：返回错误信息或 null（通过）。
 * - 额度必须为正整数分
 * - categoryId=null（总预算）：不得低于现有分类合计 othersAllocated
 * - categoryId!=null（分类）：必须先有总预算；本次不得超过 总预算 - othersAllocated
 */
export function validateBudgetAllocation(
  input: Pick<BudgetInput, 'categoryId' | 'amount'>,
  ctx: AllocationContext,
): string | null {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    return '额度必须为正数';
  }
  if (input.categoryId === null) {
    if (input.amount < ctx.othersAllocated) {
      return `总预算不能低于已分配的分类预算合计（当前已分配 ${formatCents(ctx.othersAllocated)}）`;
    }
    return null;
  }
  if (ctx.totalAmount === null) {
    return '请先设置该周期的总预算';
  }
  const remaining = ctx.totalAmount - ctx.othersAllocated;
  if (input.amount > remaining) {
    return `分类预算超出待分配额度（总预算剩余 ${formatCents(remaining)}）`;
  }
  return null;
}

/** 该周期全部预算（含停用）：总预算排最前，其余按创建时间 */
export async function listBudgets(period: BudgetPeriod): Promise<BudgetListItem[]> {
  return db
    .select({
      id: budgets.id,
      period: budgets.period,
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
    .where(eq(budgets.period, period))
    .orderBy(sql`${budgets.categoryId} IS NOT NULL`, budgets.createdAt);
}

/** 信封分配汇总（读库后委托纯函数）。无总预算返回 null。 */
export async function allocationSummary(period: BudgetPeriod): Promise<AllocationSummary | null> {
  const rows = await db
    .select({ categoryId: budgets.categoryId, amount: budgets.amount })
    .from(budgets)
    .where(eq(budgets.period, period));
  return computeAllocation(rows);
}

/** 该周期分类预算合计；excludeCategoryId 排除某分类（更新时不算自身） */
async function sumCategoryAllocations(
  period: BudgetPeriod,
  excludeCategoryId?: string,
): Promise<number> {
  const conds = [eq(budgets.period, period), sql`${budgets.categoryId} IS NOT NULL`];
  if (excludeCategoryId !== undefined) {
    conds.push(ne(budgets.categoryId, excludeCategoryId));
  }
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${budgets.amount}), 0)`.mapWith(Number) })
    .from(budgets)
    .where(and(...conds));
  return row?.total ?? 0;
}

/** 查找某周期 (period, categoryId) 的预算行 */
async function findBudgetRow(
  period: BudgetPeriod,
  categoryId: string | null,
): Promise<{ id: string; amount: number } | null> {
  const cond =
    categoryId === null
      ? and(eq(budgets.period, period), isNull(budgets.categoryId))
      : and(eq(budgets.period, period), eq(budgets.categoryId, categoryId));
  const [row] = await db
    .select({ id: budgets.id, amount: budgets.amount })
    .from(budgets)
    .where(cond)
    .limit(1);
  return row ?? null;
}

/**
 * 每周期每分类 upsert，强制信封分配约束（先取数再校验再写）。
 * 总预算（categoryId=null）唯一性靠先查后写保证（SQLite 唯一索引不约束 NULL）。
 */
export async function upsertBudget(input: BudgetInput): Promise<string> {
  const totalRow = input.categoryId === null ? null : await findBudgetRow(input.period, null);
  const others = await sumCategoryAllocations(
    input.period,
    input.categoryId === null ? undefined : input.categoryId,
  );
  const error = validateBudgetAllocation(input, {
    totalAmount: totalRow?.amount ?? null,
    othersAllocated: others,
  });
  if (error) throw new Error(error);

  const existing = await findBudgetRow(input.period, input.categoryId);
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
    period: input.period,
    categoryId: input.categoryId,
    amount: input.amount,
    alertPct: input.alertPct,
    enabled: 1,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** 删除预算。删除总预算时若仍有分类预算则拒绝，保持分配一致性。 */
export async function removeBudget(id: string): Promise<void> {
  const [row] = await db
    .select({ period: budgets.period, categoryId: budgets.categoryId })
    .from(budgets)
    .where(eq(budgets.id, id))
    .limit(1);
  if (!row) return;
  if (row.categoryId === null) {
    const allocated = await sumCategoryAllocations(row.period);
    if (allocated > 0) {
      throw new Error('请先删除该周期所有分类预算，再删除总预算');
    }
  }
  await db.delete(budgets).where(eq(budgets.id, id));
}

export type BudgetStatusItem = {
  budgetId: string;
  period: BudgetPeriod;
  categoryId: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  amount: number;
  alertPct: number;
  spent: number;
  remaining: number;
  pct: number;
  daily: number;
  level: BudgetLevel;
};

export type BudgetStatus = {
  period: BudgetPeriod;
  periodKey: string;
  total: BudgetStatusItem | null;
  allocation: AllocationSummary | null;
  categories: BudgetStatusItem[];
};

const parentCat = alias(categories, 'parent_cat');

/** 区间内 expense 按一级分类归并（子分类计入父分类） */
async function spentByTopCategory(start: string, end: string): Promise<Map<string, number>> {
  const groupId = sql<string>`COALESCE(${parentCat.id}, ${categories.id})`;
  const rows = await db
    .select({
      categoryId: groupId,
      total: sql<number>`SUM(${transactions.amountBaseCents})`.mapWith(Number),
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCat, eq(categories.parentId, parentCat.id))
    .where(
      and(
        sql`${transactions.dateKey} >= ${start}`,
        sql`${transactions.dateKey} <= ${end}`,
        eq(transactions.type, 'expense'),
      ),
    )
    .groupBy(groupId);
  return new Map(rows.map((r) => [r.categoryId, r.total]));
}

/** 区间内总支出（expense 本位币额 + transfer fee 折本位币，与 stats expenseSum 同口径） */
async function totalExpense(start: string, end: string): Promise<number> {
  const [row] = await db
    .select({
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
  return row?.expense ?? 0;
}

/**
 * 某周期预算执行情况（仅启用预算）：
 * - 分类预算：区间内 expense 按一级分类归并
 * - 总预算：区间内 expense + transfer fee（与 monthSummary / expenseSum 同口径）
 * 三类聚合并行查询。
 */
export async function budgetStatus(period: BudgetPeriod, periodKey: string): Promise<BudgetStatus> {
  const [start, end] = periodRange(period, periodKey);

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
    .where(and(eq(budgets.period, period), eq(budgets.enabled, 1)))
    .orderBy(sql`${budgets.categoryId} IS NOT NULL`, budgets.createdAt);

  const [spentMap, totalSpent, allocation] = await Promise.all([
    spentByTopCategory(start, end),
    totalExpense(start, end),
    allocationSummary(period),
  ]);

  const today = todayKey();
  const build = (row: (typeof budgetRows)[number], spent: number): BudgetStatusItem => {
    const remaining = row.amount - spent;
    return {
      budgetId: row.id,
      period,
      categoryId: row.categoryId,
      name: row.categoryId === null ? '总预算' : (row.categoryName ?? ''),
      icon: row.categoryIcon,
      color: row.categoryColor,
      amount: row.amount,
      alertPct: row.alertPct,
      spent,
      remaining,
      pct: budgetPct(spent, row.amount),
      daily: dailyAvailable(remaining, period, periodKey, today),
      level: budgetLevel(spent, row.amount, row.alertPct),
    };
  };

  let total: BudgetStatusItem | null = null;
  const categoryItems: BudgetStatusItem[] = [];
  for (const row of budgetRows) {
    if (row.categoryId === null) total = build(row, totalSpent);
    else categoryItems.push(build(row, spentMap.get(row.categoryId) ?? 0));
  }
  return { period, periodKey, total, allocation, categories: categoryItems };
}
