import { dayjs } from "@/lib/date";

/** 趋势粒度 */
export type TrendGranularity = "day" | "week" | "month" | "year";

/** SQL 聚合出的按日收支行 */
export type DailyPoint = { dateKey: string; income: number; expense: number };

/** 趋势序列点（金额单位：分） */
export type TrendPoint = {
	key: string;
	label: string;
	income: number;
	expense: number;
};

/**
 * 某个 date_key 归属的分桶键：
 * day='YYYY-MM-DD'，week=周一的 date_key（zh-cn 周起始），month='YYYY-MM'，year='YYYY'
 */
export function bucketKey(
	dateKey: string,
	granularity: TrendGranularity,
): string {
	switch (granularity) {
		case "day":
			return dateKey;
		case "week":
			return dayjs(dateKey).startOf("week").format("YYYY-MM-DD");
		case "month":
			return dateKey.slice(0, 7);
		case "year":
			return dateKey.slice(0, 4);
	}
}

/**
 * Chart x-axis label: dot-separated, no Chinese unit.
 * - day/week: pair month and day, e.g. "8.11"
 * - month: prepend the year only when the series crosses years, e.g. "2026.08";
 *   otherwise bare month number "8"
 * - year: bare year number "2026"
 */
export function axisLabel(
	key: string,
	granularity: TrendGranularity,
	crossYear: boolean,
): string {
	switch (granularity) {
		case "day":
		case "week":
			return dayjs(key).format("M.D");
		case "month":
			return crossYear
				? dayjs(`${key}-01`).format("YYYY.MM")
				: dayjs(`${key}-01`).format("M");
		case "year":
			return key;
	}
}

function bucketStartDate(key: string, granularity: TrendGranularity) {
	if (granularity === "month") return dayjs(`${key}-01`);
	if (granularity === "year") return dayjs(`${key}-01-01`);
	return dayjs(key);
}

/** 生成 [startKey, endKey] 范围内的全部分桶键（含首尾所在桶），用于补零 */
export function bucketKeys(
	startKey: string,
	endKey: string,
	granularity: TrendGranularity,
): string[] {
	const unit = granularity;
	const end = dayjs(endKey);
	const keys: string[] = [];
	let cur = bucketStartDate(bucketKey(startKey, granularity), granularity);
	while (cur.isBefore(end) || cur.isSame(end, "day")) {
		keys.push(bucketKey(cur.format("YYYY-MM-DD"), granularity));
		cur = cur.add(1, unit);
	}
	return keys;
}

/** 按粒度分组并在无数据的桶补 0，返回有序趋势序列 */
export function buildTrendSeries(
	rows: DailyPoint[],
	granularity: TrendGranularity,
	startKey: string,
	endKey: string,
): TrendPoint[] {
	const sums = new Map<string, { income: number; expense: number }>();
	for (const row of rows) {
		const key = bucketKey(row.dateKey, granularity);
		const prev = sums.get(key) ?? { income: 0, expense: 0 };
		sums.set(key, {
			income: prev.income + row.income,
			expense: prev.expense + row.expense,
		});
	}
	const crossYear = startKey.slice(0, 4) !== endKey.slice(0, 4);
	return bucketKeys(startKey, endKey, granularity).map((key) => {
		const s = sums.get(key) ?? { income: 0, expense: 0 };
		return {
			key,
			label: axisLabel(key, granularity, crossYear),
			income: s.income,
			expense: s.expense,
		};
	});
}

/** 以 endMonthKey 结尾的最近 n 个月份键（升序），如 n=3 → ['2026-05','2026-06','2026-07'] */
export function monthKeysBack(endMonthKey: string, n: number): string[] {
	const end = dayjs(`${endMonthKey}-01`);
	const keys: string[] = [];
	for (let i = n - 1; i >= 0; i--) {
		keys.push(end.subtract(i, "month").format("YYYY-MM"));
	}
	return keys;
}

/** 热力图强度分档：0=无支出，1-4 按相对当月最大值四等分 */
export function heatLevel(expense: number, max: number): 0 | 1 | 2 | 3 | 4 {
	if (expense <= 0 || max <= 0) return 0;
	const ratio = expense / max;
	if (ratio <= 0.25) return 1;
	if (ratio <= 0.5) return 2;
	if (ratio <= 0.75) return 3;
	return 4;
}

export type MonthDelta = { month: string; delta: number };
export type NetWorthPoint = { month: string; value: number };

/**
 * 净资产序列：base（初始余额合计）+ 截至各月末的累计变动。
 * deltas 可包含窗口之前的月份，会累进到窗口首月。
 */
export function cumulateNetWorth(
	base: number,
	deltas: MonthDelta[],
	monthKeys: string[],
): NetWorthPoint[] {
	const sorted = [...deltas].sort((a, b) => (a.month < b.month ? -1 : 1));
	const points: NetWorthPoint[] = [];
	let acc = base;
	let i = 0;
	for (const month of monthKeys) {
		while (i < sorted.length && sorted[i]!.month <= month) {
			acc += sorted[i]!.delta;
			i++;
		}
		points.push({ month, value: acc });
	}
	return points;
}

/** 追加占比字段（%，保留一位小数）；总额为 0 时占比为 0 */
export function withPercent<T extends { total: number }>(
	rows: T[],
): (T & { pct: number })[] {
	const sum = rows.reduce((s, r) => s + r.total, 0);
	return rows.map((r) => ({
		...r,
		pct: sum > 0 ? Math.round((r.total / sum) * 1000) / 10 : 0,
	}));
}
