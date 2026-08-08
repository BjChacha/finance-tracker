export const ACCOUNT_TYPES = [
  'cash',
  'bank',
  'digital_wallet',
  'stored_value_card',
  'credit_card',
  'online_credit',
  'investment',
  'long_term_asset',
  'other',
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

const ACCOUNT_TYPE_SET = new Set<string>(ACCOUNT_TYPES);

export function normalizeAccountType(value: unknown): AccountType {
  if (value === 'credit') return 'credit_card';
  if (typeof value === 'string' && ACCOUNT_TYPE_SET.has(value)) {
    return value as AccountType;
  }
  return 'other';
}
