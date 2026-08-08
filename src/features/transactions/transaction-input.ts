import type { TransactionType } from '@/db/schema';
import { evalMoneyExpr } from '@/lib/calc';
import { combineDateAndTime, dayjs } from '@/lib/date';
import { parseMoneyToCents } from '@/lib/money';
import type { TxInput } from './repository';

export type TransactionValidationError =
  | 'invalidAmount'
  | 'needAccount'
  | 'needCategory'
  | 'sameAccount'
  | 'invalidFee'
  | 'invalidDate';

export type TransactionDraft = {
  type: TransactionType;
  amountText: string;
  feeText: string;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  projectId: string | null;
  dateText: string;
  timeText: string;
  note: string;
  currency: string;
  exchangeRate: number;
};

export type TransactionInputResult =
  | { input: TxInput; error: null }
  | { input: null; error: TransactionValidationError };

export function buildTransactionInput(draft: TransactionDraft): TransactionInputResult {
  const amount = evalMoneyExpr(draft.amountText);
  if (amount === null || amount <= 0) return { input: null, error: 'invalidAmount' };
  if (!draft.accountId) return { input: null, error: 'needAccount' };
  if (draft.type === 'transfer') {
    if (!draft.toAccountId) return { input: null, error: 'needAccount' };
    if (draft.toAccountId === draft.accountId) return { input: null, error: 'sameAccount' };
  } else if (!draft.categoryId) {
    return { input: null, error: 'needCategory' };
  }

  const date = dayjs(draft.dateText, 'YYYY-MM-DD');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.dateText) ||
    !date.isValid() ||
    date.format('YYYY-MM-DD') !== draft.dateText
  ) {
    return { input: null, error: 'invalidDate' };
  }
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(draft.timeText);
  if (
    !timeMatch ||
    Number(timeMatch[1]) > 23 ||
    Number(timeMatch[2]) > 59
  ) {
    return { input: null, error: 'invalidDate' };
  }
  let fee = 0;
  if (draft.type === 'transfer' && draft.feeText.trim() !== '') {
    const parsedFee = parseMoneyToCents(draft.feeText);
    if (parsedFee === null || parsedFee < 0) return { input: null, error: 'invalidFee' };
    fee = parsedFee;
  }

  return {
    input: {
      type: draft.type,
      amount,
      fee,
      accountId: draft.accountId,
      toAccountId: draft.type === 'transfer' ? draft.toAccountId : null,
      categoryId: draft.type === 'transfer' ? null : draft.categoryId,
      projectId: draft.projectId,
      date: combineDateAndTime(draft.dateText, draft.timeText),
      note: draft.note.trim(),
      currency: draft.currency,
      exchangeRate: draft.exchangeRate,
    },
    error: null,
  };
}
