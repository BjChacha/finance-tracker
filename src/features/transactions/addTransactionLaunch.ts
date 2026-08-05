import type { TransactionType } from '@/db/schema';

export type AddTransactionRouteParams = {
  amount?: string;
  currency?: string;
  type?: string;
  handoffId?: string;
};

export type AddTransactionLaunch = {
  initialAmountCents: number | null;
  initialCurrency: string;
  initialType: Extract<TransactionType, 'expense' | 'income'>;
};

export function parseAddTransactionLaunch(params: AddTransactionRouteParams): AddTransactionLaunch {
  const amount = params.amount != null && params.amount !== '' ? Number(params.amount) : null;
  return {
    initialAmountCents:
      amount !== null && Number.isSafeInteger(amount) && amount > 0 ? amount : null,
    initialCurrency: params.currency?.trim().toUpperCase() || 'CNY',
    initialType: params.type === 'income' ? 'income' : 'expense',
  };
}
