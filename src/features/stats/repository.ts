import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db/client";
import { accounts, categories, transactions } from "@/db/schema";
import { listAccountsWithBalance } from "@/features/accounts";
import { monthRange, toMonthKey, todayKey } from "@/lib/date";
import {
	buildTrendSeries,
	cumulateNetWorth,
	monthKeysBack,
	withPercent,
	type NetWorthPoint,
	type TrendGranularity,
	type TrendPoint,
} from "./transform";

/** 统计日期范围（date_key 闭区间） */
export type StatsRange = { start: string; end: string };
export type BreakdownType = "expense" | "income";

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

/** 全部交易的实际日期范围（min/max dateKey）；空表时兜底当月，保证趋势补零有界。 */
export async function transactionDateRange(): Promise<StatsRange> {
	const [row] = await db
		.select({
			min: sql<string>`MIN(${transactions.dateKey})`,
			max: sql<string>`MAX(${transactions.dateKey})`,
		})
		.from(transactions);
	const [start, end] = monthRange(toMonthKey(todayKey()));
	return { start: row?.min ?? start, end: row?.max ?? end };
}

export type TransactionSummary = {
	/** 首笔交易日期（dateKey），空表为 null */
	firstDate: string | null;
	/** 全部交易笔数（无软删除，COUNT(*) 即真实记录数） */
	count: number;
	/** 跟踪金额 = |收入| + |支出| + 转账费折本位币（分）；口径同 incomeSum/expenseSum */
	trackedCents: number;
};

/** 全局记账摘要：起始日 / 笔数 / 跟踪金额（本位币分，全表无 range） */
export async function transactionSummary(): Promise<TransactionSummary> {
	const [row] = await db
		.select({
			firstDate: sql<string>`MIN(${transactions.dateKey})`,
			count: sql<number>`COUNT(*)`.mapWith(Number),
			trackedCents: sql<number>`
        COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amountBaseCents} ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amountBaseCents} ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN ${transactions.type} = 'transfer' THEN CAST(ROUND(${transactions.fee} * ${transactions.exchangeRate} / 1000000.0) AS INTEGER) ELSE 0 END), 0)
      `.mapWith(Number),
		})
		.from(transactions);
	return {
		firstDate: row?.firstDate ?? null,
		count: row?.count ?? 0,
		trackedCents: row?.trackedCents ?? 0,
	};
}

/** 口径与 monthSummary 一致：transfer 不计收支，transfer 的 fee 计支出。均以本位币分计。 */
const incomeSum = () =>
	sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amountBaseCents} ELSE 0 END), 0)`.mapWith(
		Number,
	);
const expenseSum = () =>
	sql<number>`COALESCE(SUM(CASE
    WHEN ${transactions.type} = 'expense' THEN ${transactions.amountBaseCents}
    WHEN ${transactions.type} = 'transfer' THEN CAST(ROUND(${transactions.fee} * ${transactions.exchangeRate} / 1000000.0) AS INTEGER)
    ELSE 0 END), 0)`.mapWith(Number);

const parentCat = alias(categories, "parent_cat");

/**
 * 分类占比：不传 parentId 时按一级分类汇总（子分类归并到父分类）；
 * 传 parentId 时返回该一级分类自身及其子分类的明细汇总（下钻）。
 */
export async function categoryBreakdown(
	range: StatsRange,
	type: BreakdownType,
	parentId?: string | null,
): Promise<CategorySlice[]> {
	const totalExpr = sql<number>`SUM(${transactions.amountBaseCents})`.mapWith(
		Number,
	);
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
			.orderBy(desc(sql`SUM(${transactions.amountBaseCents})`));
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
		.orderBy(desc(sql`SUM(${transactions.amountBaseCents})`));
	return withPercent(rows);
}

/** 收支趋势：SQL 按日聚合后在内存按粒度分组补零（周起始由 dayjs zh-cn 计算） */
export async function trend(
	granularity: TrendGranularity,
	range: StatsRange,
): Promise<TrendPoint[]> {
	const rows = await db
		.select({
			dateKey: transactions.dateKey,
			income: incomeSum(),
			expense: expenseSum(),
		})
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
		.map((a) => ({
			id: a.id,
			name: a.name,
			icon: a.icon,
			color: a.color,
			total: a.balance,
		}));
	return withPercent(positive).sort((a, b) => b.total - a.total);
}

const fromAcc = alias(accounts, "from_acc");
const toAcc = alias(accounts, "to_acc");

/** 最近 n 个月每月月末净资产（本位币；includeInTotal=1 且未归档账户） */
export async function netWorthTrend(n = 6): Promise<NetWorthPoint[]> {
	const months = monthKeysBack(toMonthKey(todayKey()), n);
	// 初始余额按各账户 rateToBase 折算到本位币
	const [baseRow] = await db
		.select({
			base: sql<number>`COALESCE(SUM(CAST(ROUND(${accounts.initialBalance} * ${accounts.rateToBase} / 1000000.0) AS INTEGER)), 0)`.mapWith(
				Number,
			),
		})
		.from(accounts)
		.where(and(eq(accounts.includeInTotal, 1), eq(accounts.archived, 0)));
	const monthExpr = sql<string>`substr(${transactions.dateKey}, 1, 7)`;
	// 每月净值变动（本位币）：
	// - 收入/支出/转出：取本位币额 amount_base_cents；转账手续费 fee 按汇率折本位币
	// - 转入：to_amount 按目标账户 rateToBase 折本位币
	const deltas = await db
		.select({
			month: monthExpr,
			delta: sql<number>`COALESCE(SUM(
        CASE WHEN ${fromAcc.includeInTotal} = 1 AND ${fromAcc.archived} = 0 THEN
          CASE
            WHEN ${transactions.type} = 'income' THEN ${transactions.amountBaseCents}
            WHEN ${transactions.type} = 'expense' THEN -${transactions.amountBaseCents}
            WHEN ${transactions.type} = 'transfer' THEN -(${transactions.amountBaseCents} + CAST(ROUND(${transactions.fee} * ${transactions.exchangeRate} / 1000000.0) AS INTEGER))
            ELSE 0 END
        ELSE 0 END
        + CASE WHEN ${transactions.type} = 'transfer'
            AND ${toAcc.includeInTotal} = 1 AND ${toAcc.archived} = 0
          THEN CAST(ROUND(COALESCE(${transactions.toAmount}, ${transactions.amount}) * ${toAcc.rateToBase} / 1000000.0) AS INTEGER)
          ELSE 0 END
      ), 0)`.mapWith(Number),
		})
		.from(transactions)
		.leftJoin(fromAcc, eq(transactions.accountId, fromAcc.id))
		.leftJoin(toAcc, eq(transactions.toAccountId, toAcc.id))
		.groupBy(monthExpr);
	return cumulateNetWorth(baseRow?.base ?? 0, deltas, months);
}

export type HeatCell = { dateKey: string; expense: number; income: number };

/** Daily income and expense totals for a month; transfer fees count as expense. */
export async function calendarHeatmap(monthKey: string): Promise<HeatCell[]> {
	const [start, end] = monthRange(monthKey);
	return db
		.select({
			dateKey: transactions.dateKey,
			expense: expenseSum(),
			income: incomeSum(),
		})
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
			total: sql<number>`SUM(${transactions.amountBaseCents})`.mapWith(Number),
		})
		.from(transactions)
		.innerJoin(categories, eq(transactions.categoryId, categories.id))
		.where(and(inRange(range), eq(transactions.type, type)))
		.groupBy(categories.id)
		.orderBy(desc(sql`SUM(${transactions.amountBaseCents})`));
	return withPercent(rows).slice(0, limit);
}
