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

/** key: ['stats', 'breakdown', ...] */
export function useCategoryBreakdown(
	range: StatsRange,
	type: BreakdownType,
	parentId?: string | null,
) {
	return useQuery({
		queryKey: [
			"stats",
			"breakdown",
			{ range, type, parentId: parentId ?? null },
		],
		queryFn: () => categoryBreakdown(range, type, parentId),
	});
}

export function useTrend(granularity: TrendGranularity, range: StatsRange) {
	return useQuery({
		queryKey: ["stats", "trend", { granularity, range }],
		queryFn: () => trend(granularity, range),
	});
}

export function useMonthlyCompare(n = 6) {
	return useQuery({
		queryKey: ["stats", "monthly-compare", n],
		queryFn: () => monthlyCompare(n),
	});
}

/** key: ['stats', 'date-range'] —— 全部交易的实际日期范围，供“全部时间”模式使用 */
export function useTransactionDateRange() {
	return useQuery({
		queryKey: ["stats", "date-range"],
		queryFn: () => transactionDateRange(),
	});
}

/** key: ['stats', 'summary'] —— 全局记账摘要（起始日 / 笔数 / 跟踪金额） */
export function useTransactionSummary() {
	return useQuery({
		queryKey: ["stats", "summary"],
		queryFn: () => transactionSummary(),
	});
}

export function useAccountDistribution() {
	return useQuery({
		queryKey: ["stats", "account-distribution"],
		queryFn: () => accountDistribution(),
	});
}

export function useNetWorthTrend(n = 6) {
	const today = useTodayKey();
	return useQuery({
		queryKey: ["stats", "net-worth", n, today],
		queryFn: () => netWorthTrend(n),
	});
}

export function useAssetHistory(range: StatsRange, granularity: TrendGranularity, enabled = true) {
  return useQuery({ queryKey: ['stats', 'asset-history', range, granularity],
    queryFn: () => assetHistory(range, granularity), enabled });
}

export function useAssetHistoryStart() {
  const today = useTodayKey();
  return useQuery({ queryKey: ['stats', 'asset-history-start', today],
    queryFn: () => assetHistoryStart(today) });
}

export function useCalendarHeatmap(monthKey: string) {
	const qc = useQueryClient();
	const today = useTodayKey();
	const query = useQuery({
		queryKey: ["stats", "heatmap", monthKey, today],
		queryFn: () => calendarHeatmap(monthKey),
		// 切换月份时先保持上一月数据，避免日历闪空
		placeholderData: keepPreviousData,
	});
	// 预取相邻月份：点上一月/下一月时直接命中缓存，无需等待加载
	useEffect(() => {
		for (const delta of [-1, 1]) {
			const key = dayjs(`${monthKey}-01`).add(delta, "month").format("YYYY-MM");
			void qc.prefetchQuery({
				queryKey: ["stats", "heatmap", key, today],
				queryFn: () => calendarHeatmap(key),
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
	});
}
