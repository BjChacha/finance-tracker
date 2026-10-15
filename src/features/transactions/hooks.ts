import { useCallback } from 'react';
import {
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { checkBudgetsAfterTransaction } from '@/features/budgets';
import { toDateKey } from '@/lib/date';
import { invalidateTransactionData } from './invalidate';
import {
  allTimeSummary,
  createTransaction,
  daySummary,
  getTransactionById,
  listRecentTransactions,
  listTransactions,
  monthSummary,
  removeTransaction,
  searchTransactions,
  updateTransaction,
  type TxFilters,
  type TxInput,
  type TxListItem,
  type TransactionSearchCursor,
  transactionPage,
  transactionDailyTotals,
  transactionTotals,
  largestExpenses,
} from './repository';
import { normalizeTransactionSearchQuery } from './search-query';

/** key: ['transactions', filters] */
export function useTransactions(filters: TxFilters) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => listTransactions(filters),
  });
}

export function useTransactionPages(filters: TxFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['transactions', 'pages', filters],
    queryFn: ({ pageParam }) => transactionPage(filters, pageParam),
    initialPageParam: null as TransactionSearchCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
}

export function useTransactionDailyTotals(filters: TxFilters, enabled = true) {
  return useQuery({ queryKey: ['transactions-summary', 'days', filters],
    queryFn: () => transactionDailyTotals(filters), enabled });
}

export function useTransactionTotals(filters: TxFilters) {
  return useQuery({ queryKey: ['transactions-summary', 'scope', filters],
    queryFn: () => transactionTotals(filters) });
}

export function useLargestExpenses(range: NonNullable<TxFilters['range']>) {
  return useQuery({ queryKey: ['transactions', 'largest', range], queryFn: () => largestExpenses(range) });
}

/** key: ['transaction', id] */
export function transactionQueryOptions(id: string) {
  return queryOptions({
    queryKey: ['transaction', id],
    queryFn: () => getTransactionById(id),
  });
}

export function useTransaction(id: string) {
  return useQuery({
    ...transactionQueryOptions(id),
    enabled: id.length > 0,
  });
}

export function usePrefetchTransaction() {
  const queryClient = useQueryClient();
  return useCallback(
    (transaction: TxListItem) => {
      const { id } = transaction;
      if (id.length === 0) return;
      const options = transactionQueryOptions(id);
      queryClient.setQueryData<TxListItem | null>(
        options.queryKey,
        (current) => current ?? transaction,
      );
      void queryClient.prefetchQuery(options);
    },
    [queryClient],
  );
}

export function useMonthSummary(monthKey: string) {
  return useQuery({
    queryKey: ['transactions-summary', monthKey],
    queryFn: () => monthSummary(monthKey),
  });
}

/** key: ['transactions-summary', 'all'] —— 落在 ['transactions-summary'] 失效前缀下 */
export function useAllTimeSummary() {
  return useQuery({
    queryKey: ['transactions-summary', 'all'],
    queryFn: () => allTimeSummary(),
  });
}

/** key: ['transactions-summary', 'day', dateKey] —— 落在 ['transactions-summary'] 失效前缀下 */
export function useDaySummary(dateKey: string) {
  return useQuery({
    queryKey: ['transactions-summary', 'day', dateKey],
    queryFn: () => daySummary(dateKey),
  });
}

/** key: ['transactions', 'recent', limit] —— 落在 ['transactions'] 失效前缀下 */
export function useRecentTransactions(limit: number) {
  return useQuery({
    queryKey: ['transactions', 'recent', limit],
    queryFn: () => listRecentTransactions(limit),
  });
}

export function useTransactionSearch(query: string, pageSize = 50) {
  const normalizedQuery = normalizeTransactionSearchQuery(query);
  return useInfiniteQuery({
    queryKey: ['transactions', 'search', normalizedQuery, pageSize],
    queryFn: ({ pageParam }) =>
      searchTransactions({ query: normalizedQuery, cursor: pageParam, pageSize }),
    initialPageParam: null as TransactionSearchCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: normalizedQuery.length > 0,
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
