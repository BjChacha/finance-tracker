import { parseAddTransactionLaunch } from '../addTransactionLaunch';

describe('parseAddTransactionLaunch', () => {
  it('parses valid integer cents and normalizes currency', () => {
    expect(
      parseAddTransactionLaunch({
        amount: '1234',
        currency: ' usd ',
        type: 'income',
        handoffId: 'handoff-1',
      }),
    ).toEqual({
      initialAmountCents: 1234,
      initialCurrency: 'USD',
      initialType: 'income',
    });
  });

  it.each([undefined, '', '0', '-1', '1.5', 'invalid'])(
    'falls back to the keypad for invalid amount %s',
    (amount) => {
      expect(parseAddTransactionLaunch({ amount }).initialAmountCents).toBeNull();
    },
  );

  it('uses safe defaults for missing optional parameters', () => {
    expect(parseAddTransactionLaunch({})).toEqual({
      initialAmountCents: null,
      initialCurrency: 'CNY',
      initialType: 'expense',
    });
  });
});
