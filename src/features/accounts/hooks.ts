import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateTransactionData } from '@/features/transactions';
import {
  archiveAccount,
  createAccount,
  listAccountsWithBalance,
  updateAccount,
  type AccountInput,
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

export function useArchiveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveAccount(id),
    onSuccess: () => invalidateAccounts(qc),
  });
}

async function invalidateAccounts(qc: ReturnType<typeof useQueryClient>): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['accounts'] }),
    invalidateTransactionData(qc),
  ]);
}
