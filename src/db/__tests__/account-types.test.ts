import { ACCOUNT_TYPES, normalizeAccountType } from '../account-types';

describe('account types', () => {
  it('defines the canonical display order without duplicates', () => {
    expect(ACCOUNT_TYPES).toEqual([
      'cash',
      'bank',
      'digital_wallet',
      'stored_value_card',
      'credit_card',
      'online_credit',
      'investment',
      'long_term_asset',
      'other',
    ]);
    expect(new Set(ACCOUNT_TYPES).size).toBe(ACCOUNT_TYPES.length);
  });

  it.each(ACCOUNT_TYPES)('preserves current type %s', (type) => {
    expect(normalizeAccountType(type)).toBe(type);
  });

  it('maps the legacy credit type to credit_card', () => {
    expect(normalizeAccountType('credit')).toBe('credit_card');
  });

  it.each(['alipay', 'wechat', 'unknown', '', null, undefined])(
    'maps unsupported value %s to other',
    (value) => {
      expect(normalizeAccountType(value)).toBe('other');
    },
  );
});
