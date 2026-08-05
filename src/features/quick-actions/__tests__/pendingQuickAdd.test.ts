import { toQuickAddTransactionHref } from '../pendingQuickAdd';

describe('toQuickAddTransactionHref', () => {
  it('preserves the native handoff payload as route search parameters', () => {
    expect(
      toQuickAddTransactionHref({
        amountCents: 1234,
        currency: 'HKD',
        type: 'income',
        handoffId: 'handoff-1',
      }),
    ).toEqual({
      pathname: '/quick-add-transaction',
      params: {
        amount: '1234',
        currency: 'HKD',
        type: 'income',
        handoffId: 'handoff-1',
      },
    });
  });
});
