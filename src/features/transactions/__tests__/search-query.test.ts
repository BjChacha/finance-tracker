import {
  escapeTransactionSearchLike,
  normalizeTransactionSearchQuery,
  parseTransactionSearchQuery,
} from '../search-query';

describe('transaction search query parsing', () => {
  it('normalizes full-width digits, punctuation, case, and whitespace', () => {
    expect(normalizeTransactionSearchQuery('  ２００．５  中国BANK\n旅游  ')).toBe(
      '200.5 中国bank 旅游',
    );
  });

  it('parses numeric tokens as display amount prefixes', () => {
    expect(parseTransactionSearchQuery('0200 200.5 200.50').tokens).toEqual([
      { kind: 'amount', value: '200' },
      { kind: 'amount', value: '200.5' },
      { kind: 'amount', value: '200.50' },
    ]);
  });

  it('keeps mixed numeric text as a text token', () => {
    expect(parseTransactionSearchQuery('2026旅游').tokens).toEqual([
      { kind: 'text', value: '2026旅游', likePattern: '%2026旅游%' },
    ]);
  });

  it('escapes every LIKE metacharacter literally', () => {
    expect(escapeTransactionSearchLike('50%_off~today')).toBe('50~%~_off~~today');
    expect(parseTransactionSearchQuery('50%_off').tokens).toEqual([
      { kind: 'text', value: '50%_off', likePattern: '%50~%~_off%' },
    ]);
  });

  it('returns no tokens for an empty normalized query', () => {
    expect(parseTransactionSearchQuery('　 \n ')).toEqual({ normalizedQuery: '', tokens: [] });
  });
});
