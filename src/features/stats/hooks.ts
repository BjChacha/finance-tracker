import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { dayjs } from "@/lib/date";
import { assetHistory, assetHistoryStart } from '@/features/accounts/history';
import { useTodayKey } from '@/lib/use-today-key';
import {
	accountDistribution,
	calendarHeatmap,
	categoryBreakdown,
	categoryRank,
	monthlyCompare,
	netWorthTrend,
	transactionDateRange,
	transactionSummary,
	trend,
	type BreakdownType,
	type StatsRange,
} from "./repository";
import type { TrendGranularity } from "./transform";

/**
 * 派生统计的缓存策略：
 * - staleTime 60s：同一周期内反复切换/回到看板直接用缓存（这些是纯聚合，不是源数据）；
 * - gcTime 30min：切走再回来不必重算。
 * 任何交易/账户写入仍会经 invalidateTransactionData 立即失效（invalidate 优先于 staleTime），
 * 正确性不受影响。
 */
export const STATS_STALE_TIME = 60_000;
export const STATS_GC_TIME = 30 * 60_000;

/* ------------------ 可复用的 queryOptions 构造器（预取共用） ------------------ */
/* hooks 与预取必须走同一构造器，保证 queryKey 严格一致（key 漂移 = 缓存永不命中）。 */

export function categoryBreakdownOptions(
	range: StatsRange,
	type: BreakdownType,
	parentId?: string | null,
) {
	return {
		queryKey: [
			"stats",
			"breakdown",
			{ range, type, parentId: parentId ?? null },
		],
		queryFn: () => categoryBreakdown(range, type, parentId),
		staleTime: STATS_STALE_TIME,
		gcTime: STATS_GC_TIME,
	};
}

export function trendOptions(granularity: TrendGranularity, range: StatsRange) {
	return {
		queryKey: ["stats", "trend", { granularity, range }],
		queryFn: () => trend(granularity, range),
		staleTime: STATS_STALE_TIME,
		gcTime: STATS_GC_TIME,
	};
}

export function assetHistoryOptions(range: StatsRange, granularity: TrendGranularity) {
	return {
		queryKey: ["stats", "asset-history", range, granularity],
		queryFn: () => assetHistory(range, granularity),
		staleTime: STATS_STALE_TIME,
		gcTime: STATS_GC_TIME,
	};
}

export function assetHistoryStartOptions(today: string) {
	return {
		queryKey: ["stats", "asset-history-start", today],
		queryFn: () => assetHistoryStart(today),
		staleTime: STATS_STALE_TIME,
		gcTime: STATS_GC_TIME,
	};
}

/* ---------------------------------- hooks ---------------------------------- */

/** key: ['stats', 'breakdown', ...] */
export function useCategoryBreakdown(
	range: StatsRange,
	type: BreakdownType,
	parentId?: string | null,
	enabled = true,
) {
	return useQuery({ ...categoryBreakdownOptions(range, type, parentId), enabled });
}

export function useTrend(granularity: TrendGranularity, range: StatsRange, enabled = true) {
	return useQuery({ ...trendOptions(granularity, range), enabled });
}

export function useMonthlyCompare(n = 6) {
	return useQuery({
		queryKey: ["stats", "monthly-compare", n],
		queryFn: () => monthlyCompare(n),
		staleTime: STATS_STALE_TIME,
		gcTime: STATS_GC_TIME,
	});
}

/** key: ['stats', 'date-range'] —— 全部交易的实际日期范围，供“全部时间”模式使用 */
export function useTransactionDateRange() {
	return useQuery({
		queryKey: ["stats", "date-range"],
		queryFn: () => transactionDateRange(),
		staleTime: STATS_STALE_TIME,
		gcTime: STATS_GC_TIME,
	});
}

/** key: ['stats', 'summary'] —— 全局记账摘要（起始日 / 笔数 / 跟踪金额） */
export function useTransactionSummary() {
	return useQuery({
		queryKey: ["stats", "summary"],
		queryFn: () => transactionSummary(),
		staleTime: STATS_STALE_TIME,
		gcTime: STATS_GC_TIME,
	});
}

export function useAccountDistribution() {
	return useQuery({
		queryKey: ["stats", "account-distribution"],
		queryFn: () => accountDistribution(),
		staleTime: STATS_STALE_TIME,
		gcTime: STATS_GC_TIME,
	});
}

export function useNetWorthTrend(n = 6) {
	const today = useTodayKey();
	return useQuery({
		queryKey: ["stats", "net-worth", n, today],
		queryFn: () => netWorthTrend(n),
		staleTime: STATS_STALE_TIME,
		gcTime: STATS_GC_TIME,
	});
}

export function useAssetHistory(range: StatsRange, granularity: TrendGranularity, enabled = true) {
	return useQuery({ ...assetHistoryOptions(range, granularity), enabled });
}

export function useAssetHistoryStart(enabled = true) {
	const today = useTodayKey();
	return useQuery({ ...assetHistoryStartOptions(today), enabled });
}

export function useCalendarHeatmap(monthKey: string) {
	const qc = useQueryClient();
	const today = useTodayKey();
	const query = useQuery({
		queryKey: ["stats", "heatmap", monthKey, today],
		queryFn: () => calendarHeatmap(monthKey),
		// 切换月份时先保持上一月数据，避免日历闪空
		placeholderData: keepPreviousData,
		staleTime: STATS_STALE_TIME,
		gcTime: STATS_GC_TIME,
	});
	// 预取相邻月份：点上一月/下一月时直接命中缓存，无需等待加载
	useEffect(() => {
		for (const delta of [-1, 1]) {
			const key = dayjs(`${monthKey}-01`).add(delta, "month").format("YYYY-MM");
			void qc.prefetchQuery({
				queryKey: ["stats", "heatmap", key, today],
				queryFn: () => calendarHeatmap(key),
				staleTime: STATS_STALE_TIME,
			});
		}
	}, [monthKey, qc, today]);
	return query;
}

export function useCategoryRank(
	range: StatsRange,
	type: BreakdownType,
	limit = 10,
) {
	return useQuery({
		queryKey: ["stats", "rank", { range, type, limit }],
		queryFn: () => categoryRank(range, type, limit),
		staleTime: STATS_STALE_TIME,
		gcTime: STATS_GC_TIME,
	});
}
