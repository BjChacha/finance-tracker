import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateTransactionData } from '@/features/transactions/invalidate';
import {
  adjustAccountBalance,
  archiveAccount,
  createAccount,
  deleteAccountCascade,
  listAccountsWithBalance,
  updateAccount,
  updateAccountDetails,
  type AccountDetailsInput,
  type AccountInput,
  type AccountWithBalance,
} from './repository';

/** 全部未归档账户 + 余额，key: ['account-balances'] */
export function useAccountBalances() {
  return useQuery({
    queryKey: ['account-balances'],
    queryFn: () => listAccountsWithBalance(),
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AccountInput) => createAccount(input),
    onSuccess: () => invalidateAccounts(qc),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AccountInput }) => updateAccount(id, input),
    onSuccess: () => invalidateAccounts(qc),
  });
}

export function useUpdateAccountDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AccountDetailsInput }) =>
      updateAccountDetails(id, input),
    onSuccess: () => invalidateAccounts(qc),
  });
}

export function useArchiveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveAccount(id),
    onSuccess: () => invalidateAccounts(qc),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAccountCascade(id),
    onSuccess: () =>
      Promise.all([
        invalidateAccounts(qc),
        qc.invalidateQueries({ queryKey: ['recurring'] }),
      ]),
  });
}

/** 调整账户余额（记交易或并入初始余额），成功后刷新账户与交易查询。 */
export function useAdjustAccountBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      account,
      actualCents,
      recordTx,
    }: {
      account: AccountWithBalance;
      actualCents: number;
      recordTx: boolean;
    }) => adjustAccountBalance(account, actualCents, recordTx),
    onSuccess: () => invalidateAccounts(qc),
  });
}

async function invalidateAccounts(qc: ReturnType<typeof useQueryClient>): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['accounts'] }),
    invalidateTransactionData(qc),
  ]);
}
