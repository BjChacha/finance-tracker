import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { todayKey } from '@/lib/date';
import { scoreCategories, type SuggestType } from './model';
import { ensureBaseline } from './repository';

const EMPTY_SCORES = new Map<string, number>();

/**
 * 按金额对分类打分。key: ['suggest-baseline'](交易变更后由 invalidateTransactionData 失效)。
 * 返回「分类 id → 得分」,按得分降序迭代;未启用/无金额/无基线时返回空 Map。
 */
export function useCategorySuggestion(opts: {
  type: SuggestType;
  amountCents: number | null;
  enabled: boolean;
}): Map<string, number> {
  const { type, amountCents, enabled } = opts;
  const { data: baseline } = useQuery({
    queryKey: ['suggest-baseline'],
    queryFn: ensureBaseline,
    staleTime: Infinity,
    enabled,
  });

  return useMemo(() => {
    if (!enabled || !baseline || amountCents === null || amountCents <= 0) return EMPTY_SCORES;
    return scoreCategories(baseline, type, amountCents, todayKey());
  }, [enabled, baseline, type, amountCents]);
}
