import { dayjs } from '@/lib/date';
import { buildTransactionInput, type TransactionDraft } from '../transaction-input';

const validDraft: TransactionDraft = {
  type: 'expense',
  amountText: '12.34',
  feeText: '',
  accountId: 'account-1',
  toAccountId: null,
  categoryId: 'category-1',
  projectId: null,
  dateText: '2026-07-31',
  timeText: '09:45',
  note: ' lunch ',
  currency: 'USD',
  exchangeRate: 6_760_600,
};

describe('buildTransactionInput', () => {
  it('builds the shared create/edit payload without changing the exchange rate', () => {
    const result = buildTransactionInput(validDraft);

    expect(result).toEqual({
      input: {
        type: 'expense',
        amount: 1234,
        fee: 0,
        accountId: 'account-1',
        toAccountId: null,
        categoryId: 'category-1',
        projectId: null,
        date: dayjs('2026-07-31 09:45').valueOf(),
        note: 'lunch',
        currency: 'USD',
        exchangeRate: 6_760_600,
        clientTag: null,
      },
      error: null,
    });
  });

  it('passes the client idempotency tag through to the payload', () => {
    const result = buildTransactionInput({ ...validDraft, clientTag: 'handoff-42' });

    expect(result.input?.clientTag).toBe('handoff-42');
  });

  it.each([
    [{ amountText: '' }, 'invalidAmount'],
    [{ accountId: null }, 'needAccount'],
    [{ categoryId: null }, 'needCategory'],
    [{ dateText: '2026/07/31' }, 'invalidDate'],
    [{ dateText: '2026-02-31' }, 'invalidDate'],
    [{ timeText: '25:00' }, 'invalidDate'],
  ] as const)('rejects invalid intermediate state %o', (overrides, error) => {
    expect(buildTransactionInput({ ...validDraft, ...overrides })).toEqual({
      input: null,
      error,
    });
  });

  it('validates transfer destination and fee', () => {
    expect(
      buildTransactionInput({
        ...validDraft,
        type: 'transfer',
        toAccountId: 'account-1',
      }),
    ).toEqual({ input: null, error: 'sameAccount' });
    expect(
      buildTransactionInput({
        ...validDraft,
        type: 'transfer',
        toAccountId: 'account-2',
        feeText: 'unfinished',
      }),
    ).toEqual({ input: null, error: 'invalidFee' });
  });

  it('requires and preserves a transfer category', () => {
    expect(
      buildTransactionInput({
        ...validDraft,
        type: 'transfer',
        categoryId: null,
        toAccountId: 'account-2',
      }),
    ).toEqual({ input: null, error: 'needCategory' });

    const result = buildTransactionInput({
      ...validDraft,
      type: 'transfer',
      categoryId: 'bill-repayment',
      toAccountId: 'account-2',
    });
    expect(result.input?.categoryId).toBe('bill-repayment');
  });
});
