import { useQuery } from '@tanstack/react-query';
import {
  accountDistribution,
  calendarHeatmap,
  categoryBreakdown,
  categoryRank,
  monthlyCompare,
  netWorthTrend,
  trend,
  type BreakdownType,
  type StatsRange,
} from './repository';
import type { TrendGranularity } from './transform';

/** key: ['stats', 'breakdown', ...] */
export function useCategoryBreakdown(
  range: StatsRange,
  type: BreakdownType,
  parentId?: string | null,
) {
  return useQuery({
    queryKey: ['stats', 'breakdown', { range, type, parentId: parentId ?? null }],
    queryFn: () => categoryBreakdown(range, type, parentId),
  });
}

export function useTrend(granularity: TrendGranularity, range: StatsRange) {
  return useQuery({
    queryKey: ['stats', 'trend', { granularity, range }],
    queryFn: () => trend(granularity, range),
  });
}

export function useMonthlyCompare(n = 6) {
  return useQuery({
    queryKey: ['stats', 'monthly-compare', n],
    queryFn: () => monthlyCompare(n),
  });
}

export function useAccountDistribution() {
  return useQuery({
    queryKey: ['stats', 'account-distribution'],
    queryFn: () => accountDistribution(),
  });
}

export function useNetWorthTrend(n = 6) {
  return useQuery({
    queryKey: ['stats', 'net-worth', n],
    queryFn: () => netWorthTrend(n),
  });
}

export function useCalendarHeatmap(monthKey: string) {
  return useQuery({
    queryKey: ['stats', 'heatmap', monthKey],
    queryFn: () => calendarHeatmap(monthKey),
  });
}

export function useCategoryRank(range: StatsRange, type: BreakdownType, limit = 10) {
  return useQuery({
    queryKey: ['stats', 'rank', { range, type, limit }],
    queryFn: () => categoryRank(range, type, limit),
  });
}
