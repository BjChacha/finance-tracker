import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateTransactionData } from '@/features/transactions/invalidate';
import { todayKey } from '@/lib/date';
import {
  confirmPending,
  createRule,
  listPendingRules,
  listRules,
  removeRule,
  skipPending,
  toggleRule,
  updateRule,
  type RecurringInput,
} from './repository';

/** key: ['recurring', 'rules'] */
export function useRecurringRules() {
  return useQuery({ queryKey: ['recurring', 'rules'], queryFn: () => listRules() });
}

/** key: ['recurring', 'pending'] */
export function usePendingRules() {
  return useQuery({
    queryKey: ['recurring', 'pending'],
    queryFn: () => listPendingRules(todayKey()),
  });
}

function useInvalidateRecurring() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['recurring'] });
}

export function useCreateRule() {
  const invalidate = useInvalidateRecurring();
  return useMutation({
    mutationFn: (input: RecurringInput) => createRule(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateRule() {
  const invalidate = useInvalidateRecurring();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecurringInput }) => updateRule(id, input),
    onSuccess: () => invalidate(),
  });
}

export function useRemoveRule() {
  const invalidate = useInvalidateRecurring();
  return useMutation({
    mutationFn: (id: string) => removeRule(id),
    onSuccess: () => invalidate(),
  });
}

export function useToggleRule() {
  const invalidate = useInvalidateRecurring();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleRule(id, enabled),
    onSuccess: () => invalidate(),
  });
}

/** 待确认"记入"：生成交易，需同时失效交易/预算缓存 */
export function useConfirmPending() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => confirmPending(ruleId),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['recurring'] }),
        invalidateTransactionData(qc),
      ]),
  });
}

export function useSkipPending() {
  const invalidate = useInvalidateRecurring();
  return useMutation({
    mutationFn: (ruleId: string) => skipPending(ruleId),
    onSuccess: () => invalidate(),
  });
}
