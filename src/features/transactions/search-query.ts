export type TransactionSearchToken =
  | { kind: 'amount'; value: string }
  | { kind: 'text'; value: string; likePattern: string };

export type ParsedTransactionSearch = {
  normalizedQuery: string;
  tokens: TransactionSearchToken[];
};

const AMOUNT_TOKEN_PATTERN = /^\d+(?:\.\d{0,2})?$/;

/** Normalize compatibility characters and whitespace without changing user-visible semantics. */
export function normalizeTransactionSearchQuery(query: string): string {
  return query.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

/** Escape SQLite LIKE metacharacters using `~` as the explicit escape character. */
export function escapeTransactionSearchLike(value: string): string {
  return value.replace(/~/g, '~~').replace(/%/g, '~%').replace(/_/g, '~_');
}

function normalizeAmountPrefix(value: string): string {
  const [integerPart, fractionPart] = value.split('.');
  const normalizedInteger = integerPart!.replace(/^0+(?=\d)/, '');
  return fractionPart === undefined
    ? normalizedInteger
    : `${normalizedInteger}.${fractionPart}`;
}

export function parseTransactionSearchQuery(query: string): ParsedTransactionSearch {
  const normalizedQuery = normalizeTransactionSearchQuery(query);
  if (normalizedQuery === '') return { normalizedQuery, tokens: [] };

  const tokens = normalizedQuery.split(' ').map<TransactionSearchToken>((value) => {
    if (AMOUNT_TOKEN_PATTERN.test(value)) {
      return { kind: 'amount', value: normalizeAmountPrefix(value) };
    }
    return {
      kind: 'text',
      value,
      likePattern: `%${escapeTransactionSearchLike(value)}%`,
    };
  });

  return { normalizedQuery, tokens };
}
