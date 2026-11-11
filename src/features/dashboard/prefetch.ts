import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { budgetStatus } from '@/features/budgets/repository';
import { assetHistoryStart } from '@/features/accounts/history';
import {
  assetHistoryStartOptions,
  categoryBreakdownOptions,
  trendOptions,
  assetHistoryOptions,
} from '@/features/stats/hooks';
import type { TrendGranularity } from '@/features/stats/transform';
import {
  largestExpensesOptions,
  transactionTotalsOptions,
} from '@/features/transactions/hooks';
import {
  resolvePeriod,
  selectPeriod,
  type DateRange,
  type PeriodSelection,
} from '@/lib/analytics-range';
import { useTodayKey } from '@/lib/use-today-key';

/**
 * 看板预取：在首屏渲染完成后空闲时，把「季 / 年 / 全部」三个大范围的
 * 聚合查询提前算好放进 react-query 缓存。用户切到大范围时命中缓存，无等待。
 *
 * 与真实请求共用 options 构造器（同一个 queryKey），不会产生重复计算：
 * 同 key 的并发请求由 react-query 自行去重。
 */

function periodGranularity(period: PeriodSelection['period']): TrendGranularity {
  return period === 'quarter' ? 'week' : 'month';
}

/** 预取一个「有上期可比」的视图（季/年）：当前期 + 同期对比期 */
function prefetchComparableView(
  qc: QueryClient,
  selection: PeriodSelection,
  today: string,
): Promise<unknown>[] {
  const resolved = resolvePeriod(selection, today);
  const { range, comparison } = resolved;
  const granularity = periodGranularity(selection.period);
  return [
    qc.prefetchQuery(transactionTotalsOptions({ range })),
    qc.prefetchQuery(transactionTotalsOptions({ range: comparison })),
    qc.prefetchQuery(categoryBreakdownOptions(range, 'expense')),
    qc.prefetchQuery(categoryBreakdownOptions(comparison, 'expense')),
    qc.prefetchQuery(trendOptions('day', range)),
    qc.prefetchQuery(trendOptions('day', comparison)),
    qc.prefetchQuery(assetHistoryOptions(range, granularity)),
    qc.prefetchQuery(largestExpensesOptions(range)),
    qc.prefetchQuery({
      queryKey: ['budget-status', selection.period, selection.key, today],
      queryFn: () => budgetStatus(selection.period, selection.key, today),
    }),
  ];
}

/** 预取「全部时间」视图：先解析历史起点（看板的全量内容依赖它），再并行预取 */
async function prefetchAllView(
  qc: QueryClient,
  today: string,
): Promise<unknown[]> {
  const startOptions = assetHistoryStartOptions(today);
  await qc.prefetchQuery(startOptions);
  const start =
    qc.getQueryData<string>(startOptions.queryKey) ??
    (await assetHistoryStart(today));
  const range: DateRange = { start, end: today };
  return Promise.allSettled([
    qc.prefetchQuery(transactionTotalsOptions({ range })),
    qc.prefetchQuery(categoryBreakdownOptions(range, 'expense')),
    qc.prefetchQuery(assetHistoryOptions(range, 'month')),
    qc.prefetchQuery(largestExpensesOptions(range)),
  ]);
}

/** 看板挂载后空闲预取；页面每挂载一次最多执行一轮（react-query 自身去重） */
export function useDashboardPrefetch(): void {
  const qc = useQueryClient();
  const today = useTodayKey();
  useEffect(() => {
    const timer = setTimeout(() => {
      const quarter = selectPeriod('quarter', today);
      const year = selectPeriod('year', today);
      void Promise.allSettled(prefetchComparableView(qc, quarter, today));
      void Promise.allSettled(prefetchComparableView(qc, year, today));
      void prefetchAllView(qc, today).catch(() => {
        // 预取失败不影响看板：真正切换时按正常加载流程重试
      });
    }, 1_200);
    return () => clearTimeout(timer);
  }, [qc, today]);
}
