import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  budgetStatus,
  listBudgets,
  removeBudget,
  upsertBudget,
  type BudgetInput,
} from './repository';

/** key: ['budgets'] */
export function useBudgets() {
  return useQuery({ queryKey: ['budgets'], queryFn: () => listBudgets() });
}

/** key: ['budget-status', monthKey] */
export function useBudgetStatus(monthKey: string) {
  return useQuery({
    queryKey: ['budget-status', monthKey],
    queryFn: () => budgetStatus(monthKey),
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
