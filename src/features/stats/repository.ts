import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '@/db/client';
import { accounts, categories, transactions } from '@/db/schema';
import { listAccountsWithBalance } from '@/features/accounts';
import { monthRange, toMonthKey, todayKey } from '@/lib/date';
import {
  buildTrendSeries,
  cumulateNetWorth,
  monthKeysBack,
  withPercent,
  type NetWorthPoint,
  type TrendGranularity,
  type TrendPoint,
} from './transform';

/** 统计日期范围（date_key 闭区间） */
export type StatsRange = { start: string; end: string };
export type BreakdownType = 'expense' | 'income';

export type CategorySlice = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  /** 分 */
  total: number;
  /** 占比 %（一位小数） */
  pct: number;
};

function inRange(range: StatsRange) {
  return and(
    sql`${transactions.dateKey} >= ${range.start}`,
    sql`${transactions.dateKey} <= ${range.end}`,
  );
}

/** 口径与 monthSummary 一致：transfer 不计收支，transfer 的 fee 计支出 */
const incomeSum = () =>
  sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`.mapWith(
    Number,
  );
const expenseSum = () =>
  sql<number>`COALESCE(SUM(CASE
    WHEN ${transactions.type} = 'expense' THEN ${transactions.amount}
    WHEN ${transactions.type} = 'transfer' THEN ${transactions.fee}
    ELSE 0 END), 0)`.mapWith(Number);

const parentCat = alias(categories, 'parent_cat');

/**
 * 分类占比：不传 parentId 时按一级分类汇总（子分类归并到父分类）；
 * 传 parentId 时返回该一级分类自身及其子分类的明细汇总（下钻）。
 */
export async function categoryBreakdown(
  range: StatsRange,
  type: BreakdownType,
  parentId?: string | null,
): Promise<CategorySlice[]> {
  const totalExpr = sql<number>`SUM(${transactions.amount})`.mapWith(Number);
  if (parentId) {
    const rows = await db
      .select({
        categoryId: categories.id,
        name: categories.name,
        icon: categories.icon,
        color: categories.color,
        total: totalExpr,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          inRange(range),
          eq(transactions.type, type),
          sql`(${categories.id} = ${parentId} OR ${categories.parentId} = ${parentId})`,
        ),
      )
      .groupBy(categories.id)
      .orderBy(desc(sql`SUM(${transactions.amount})`));
    return withPercent(rows);
  }
  const groupId = sql<string>`COALESCE(${parentCat.id}, ${categories.id})`;
  const rows = await db
    .select({
      categoryId: groupId,
      name: sql<string>`COALESCE(${parentCat.name}, ${categories.name})`,
      icon: sql<string>`COALESCE(${parentCat.icon}, ${categories.icon})`,
      color: sql<string>`COALESCE(${parentCat.color}, ${categories.color})`,
      total: totalExpr,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCat, eq(categories.parentId, parentCat.id))
    .where(and(inRange(range), eq(transactions.type, type)))
    .groupBy(groupId)
    .orderBy(desc(sql`SUM(${transactions.amount})`));
  return withPercent(rows);
}

/** 收支趋势：SQL 按日聚合后在内存按粒度分组补零（周起始由 dayjs zh-cn 计算） */
export async function trend(
  granularity: TrendGranularity,
  range: StatsRange,
): Promise<TrendPoint[]> {
  const rows = await db
    .select({ dateKey: transactions.dateKey, income: incomeSum(), expense: expenseSum() })
    .from(transactions)
    .where(inRange(range))
    .groupBy(transactions.dateKey)
    .orderBy(asc(transactions.dateKey));
  return buildTrendSeries(rows, granularity, range.start, range.end);
}

export type MonthCompare = { month: string; income: number; expense: number };

/** 最近 n 个月的收入/支出对比（缺失月补零） */
export async function monthlyCompare(n = 6): Promise<MonthCompare[]> {
  const months = monthKeysBack(toMonthKey(todayKey()), n);
  const first = months[0]!;
  const last = months[months.length - 1]!;
  const range: StatsRange = { start: `${first}-01`, end: monthRange(last)[1] };
  const monthExpr = sql<string>`substr(${transactions.dateKey}, 1, 7)`;
  const rows = await db
    .select({ month: monthExpr, income: incomeSum(), expense: expenseSum() })
    .from(transactions)
    .where(inRange(range))
    .groupBy(monthExpr);
  const map = new Map(rows.map((r) => [r.month, r]));
  return months.map((m) => ({
    month: m,
    income: map.get(m)?.income ?? 0,
    expense: map.get(m)?.expense ?? 0,
  }));
}

export type AccountSlice = {
  id: string;
  name: string;
  icon: string;
  color: string;
  total: number;
  pct: number;
};

/** 账户资产分布：未归档且余额为正的账户 */
export async function accountDistribution(): Promise<AccountSlice[]> {
  const list = await listAccountsWithBalance();
  const positive = list
    .filter((a) => a.balance > 0)
    .map((a) => ({ id: a.id, name: a.name, icon: a.icon, color: a.color, total: a.balance }));
  return withPercent(positive).sort((a, b) => b.total - a.total);
}

const fromAcc = alias(accounts, 'from_acc');
const toAcc = alias(accounts, 'to_acc');

/** 最近 n 个月每月月末净资产（includeInTotal=1 且未归档账户） */
export async function netWorthTrend(n = 6): Promise<NetWorthPoint[]> {
  const months = monthKeysBack(toMonthKey(todayKey()), n);
  const [baseRow] = await db
    .select({
      base: sql<number>`COALESCE(SUM(${accounts.initialBalance}), 0)`.mapWith(Number),
    })
    .from(accounts)
    .where(and(eq(accounts.includeInTotal, 1), eq(accounts.archived, 0)));
  const monthExpr = sql<string>`substr(${transactions.dateKey}, 1, 7)`;
  const deltas = await db
    .select({
      month: monthExpr,
      delta: sql<number>`COALESCE(SUM(
        CASE WHEN ${fromAcc.includeInTotal} = 1 AND ${fromAcc.archived} = 0 THEN
          CASE
            WHEN ${transactions.type} = 'income' THEN ${transactions.amount}
            WHEN ${transactions.type} = 'expense' THEN -${transactions.amount}
            WHEN ${transactions.type} = 'transfer' THEN -(${transactions.amount} + ${transactions.fee})
            ELSE 0 END
        ELSE 0 END
        + CASE WHEN ${transactions.type} = 'transfer'
            AND ${toAcc.includeInTotal} = 1 AND ${toAcc.archived} = 0
          THEN ${transactions.amount} ELSE 0 END
      ), 0)`.mapWith(Number),
    })
    .from(transactions)
    .leftJoin(fromAcc, eq(transactions.accountId, fromAcc.id))
    .leftJoin(toAcc, eq(transactions.toAccountId, toAcc.id))
    .groupBy(monthExpr);
  return cumulateNetWorth(baseRow?.base ?? 0, deltas, months);
}

export type HeatCell = { dateKey: string; expense: number };

/** 某月每日支出总额（含转账手续费），无支出的日期不返回 */
export async function calendarHeatmap(monthKey: string): Promise<HeatCell[]> {
  const [start, end] = monthRange(monthKey);
  return db
    .select({ dateKey: transactions.dateKey, expense: expenseSum() })
    .from(transactions)
    .where(inRange({ start, end }))
    .groupBy(transactions.dateKey)
    .orderBy(asc(transactions.dateKey));
}

/** 分类排行（含二级分类独立展示），带全量占比，取前 limit 名 */
export async function categoryRank(
  range: StatsRange,
  type: BreakdownType,
  limit = 10,
): Promise<CategorySlice[]> {
  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      total: sql<number>`SUM(${transactions.amount})`.mapWith(Number),
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(inRange(range), eq(transactions.type, type)))
    .groupBy(categories.id)
    .orderBy(desc(sql`SUM(${transactions.amount})`));
  return withPercent(rows).slice(0, limit);
}
