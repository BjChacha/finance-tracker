import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkBudgetsAfterTransaction } from '@/features/budgets';
import { toDateKey } from '@/lib/date';
import { invalidateTransactionData } from './invalidate';
import {
  createTransaction,
  getTransactionById,
  listTransactions,
  monthSummary,
  removeTransaction,
  updateTransaction,
  type TxFilters,
  type TxInput,
} from './repository';

/** key: ['transactions', filters] */
export function useTransactions(filters: TxFilters) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => listTransactions(filters),
  });
}

/** key: ['transaction', id] */
export function useTransaction(id: string) {
  return useQuery({
    queryKey: ['transaction', id],
    queryFn: () => getTransactionById(id),
    enabled: id.length > 0,
  });
}

export function useMonthSummary(monthKey: string) {
  return useQuery({
    queryKey: ['transactions-summary', monthKey],
    queryFn: () => monthSummary(monthKey),
  });
}

/** 记账成功后触发预算提醒检查（fire-and-forget，失败不影响主流程） */
function runBudgetCheck(input: TxInput): void {
  void checkBudgetsAfterTransaction({
    type: input.type,
    categoryId: input.categoryId ?? null,
    dateKey: toDateKey(input.date),
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TxInput) => createTransaction(input),
    onSuccess: (_id, input) => {
      runBudgetCheck(input);
      return invalidateTransactionData(qc);
    },
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TxInput }) => updateTransaction(id, input),
    onSuccess: (_void, { input }) => {
      runBudgetCheck(input);
      return invalidateTransactionData(qc);
    },
  });
}

export function useRemoveTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeTransaction(id),
    onSuccess: () => invalidateTransactionData(qc),
  });
}
