import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TransactionType } from '@/db/schema';
import { matchTransaction, type RuleMatchInput } from './model';
import {
  listRules,
  removeRule,
  setRuleEnabled,
  upsertRule,
  type RuleInput,
  type RuleListItem,
} from './repository';
import { getCategoryStats, type CategoryStats } from './stats';

/** key: ['rules'] */
export function useRules() {
  return useQuery({ queryKey: ['rules'], queryFn: listRules });
}

/**
 * 表单里的规则预填：给定交易条件返回首条命中规则。
 * 规则列表来自 react-query 缓存（列表未挂载时也会按需拉取一次）。
 */
export function useRuleSuggestion(input: {
  type: TransactionType;
  /** 交易币种金额（分）；null = 金额未确认，仍可按备注+类型匹配 */
  amountCents: number | null;
  note: string;
  enabled?: boolean;
}): RuleListItem | null {
  const rules = useRules();
  return useMemo(() => {
    if (input.enabled === false) return null;
    if (!rules.data) return null;
    if (!input.note.trim()) return null;
    const condition: RuleMatchInput = {
      type: input.type,
      amount: input.amountCents ?? Number.MAX_SAFE_INTEGER,
      note: input.note,
    };
    return matchTransaction(
      rules.data.filter((rule) => rule.enabled === 1),
      condition,
    );
  }, [input.enabled, input.amountCents, input.note, input.type, rules.data]);
}

async function invalidateRules(qc: ReturnType<typeof useQueryClient>) {
  await qc.invalidateQueries({ queryKey: ['rules'] });
}

export function useUpsertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RuleInput) => upsertRule(input),
    onSuccess: () => invalidateRules(qc),
  });
}

export function useRemoveRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeRule(id),
    onSuccess: () => invalidateRules(qc),
  });
}

export function useSetRuleEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setRuleEnabled(id, enabled),
    onSuccess: () => invalidateRules(qc),
  });
}

/** key: ['categoryStats']；写入侧是 recordCategoryOutcome（fire-and-forget） */
export function useCategoryStats() {
  return useQuery<CategoryStats>({
    queryKey: ['categoryStats'],
    queryFn: getCategoryStats,
    staleTime: 30_000,
  });
}
