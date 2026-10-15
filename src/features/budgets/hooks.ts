import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BudgetPeriod } from '@/lib/date';
import { useTodayKey } from '@/lib/use-today-key';
import {
  budgetStatus,
  listBudgets,
  removeBudget,
  upsertBudget,
  type BudgetInput,
} from './repository';

/** key: ['budgets', period] */
export function useBudgets(period: BudgetPeriod) {
  return useQuery({ queryKey: ['budgets', period], queryFn: () => listBudgets(period) });
}

/** key: ['budget-status', period, periodKey] */
export function useBudgetStatus(period: BudgetPeriod, periodKey: string) {
  const today = useTodayKey();
  return useQuery({
    queryKey: ['budget-status', period, periodKey, today],
    queryFn: () => budgetStatus(period, periodKey, today),
  });
}

async function invalidateBudgets(qc: ReturnType<typeof useQueryClient>): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['budgets'] }),
    qc.invalidateQueries({ queryKey: ['budget-status'] }),
  ]);
}

export function useUpsertBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BudgetInput) => upsertBudget(input),
    onSuccess: () => invalidateBudgets(qc),
  });
}

export function useRemoveBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeBudget(id),
    onSuccess: () => invalidateBudgets(qc),
  });
}
