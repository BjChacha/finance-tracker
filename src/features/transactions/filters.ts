import { eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import { categories, transactions, type TransactionType } from '@/db/schema';
import { isDateKey, type DateRange } from '@/lib/analytics-range';
import { monthRange } from '@/lib/date';

export const UNCATEGORIZED_ID = '__uncategorized__';
export const TRANSFER_FEES_ID = '__transfer_fees__';

export type TxFilters = {
  monthKey?: string;
  range?: DateRange;
  type?: TransactionType;
  accountId?: string;
  categoryId?: string;
  includeChildren?: boolean;
};

export function transferFeeAmount() {
  return sql<number>`CAST(ROUND(${transactions.fee} * ${transactions.exchangeRate} / 1000000.0) AS INTEGER)`;
}

export function incomeAmount() {
  return sql<number>`CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amountBaseCents} ELSE 0 END`;
}

export function expenseAmount() {
  return sql<number>`CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amountBaseCents}
    WHEN ${transactions.type} = 'transfer' THEN ${transferFeeAmount()} ELSE 0 END`;
}

/** Used by paginated rows and their independent full-scope aggregates. */
export function transactionConditions(filters: TxFilters): SQL[] {
  const conditions: SQL[] = [];
  const range =
    filters.range ??
    (filters.monthKey
      ? (() => {
          const [start, end] = monthRange(filters.monthKey!);
          return { start, end };
        })()
      : undefined);
  if (range) {
    conditions.push(sql`${transactions.dateKey} >= ${range.start}`);
    conditions.push(sql`${transactions.dateKey} <= ${range.end}`);
  }
  if (filters.accountId)
    conditions.push(
      or(
        eq(transactions.accountId, filters.accountId),
        eq(transactions.toAccountId, filters.accountId),
      )!,
    );
  if (filters.categoryId === TRANSFER_FEES_ID) {
    conditions.push(
      eq(transactions.type, 'transfer'),
      sql`${transactions.fee} > 0`,
    );
  } else {
    if (filters.type === 'expense' && !filters.categoryId) {
      conditions.push(
        or(
          eq(transactions.type, 'expense'),
          sql`(${transactions.type} = 'transfer' AND ${transactions.fee} > 0)`,
        )!,
      );
    } else if (filters.type)
      conditions.push(eq(transactions.type, filters.type));
    if (filters.categoryId === UNCATEGORIZED_ID)
      conditions.push(isNull(categories.id));
    else if (filters.categoryId)
      conditions.push(
        filters.includeChildren
          ? or(
              eq(transactions.categoryId, filters.categoryId),
              eq(categories.parentId, filters.categoryId),
            )!
          : eq(transactions.categoryId, filters.categoryId),
      );
  }
  return conditions;
}

export function transactionParams(
  filters: TxFilters,
  title?: string,
): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.range) {
    params.start = filters.range.start;
    params.end = filters.range.end;
  }
  if (filters.type) params.type = filters.type;
  if (filters.categoryId) params.categoryId = filters.categoryId;
  if (filters.accountId) params.accountId = filters.accountId;
  if (filters.includeChildren) params.includeChildren = '1';
  if (title) params.title = title;
  return params;
}

export function parseTransactionParams(
  params: Record<string, string | string[] | undefined>,
): TxFilters | null {
  const scalar = (key: string) =>
    typeof params[key] === 'string' ? (params[key] as string) : undefined;
  if (Object.values(params).some(Array.isArray)) return null;
  const start = scalar('start');
  const end = scalar('end');
  const type = scalar('type');
  if (
    (start || end) &&
    (!start || !end || !isDateKey(start) || !isDateKey(end) || start > end)
  )
    return null;
  if (type && type !== 'expense' && type !== 'income' && type !== 'transfer')
    return null;
  const categoryId = scalar('categoryId');
  if (categoryId === '__other__') return null;
  if (categoryId === TRANSFER_FEES_ID && type && type !== 'expense')
    return null;
  return {
    range: start && end ? { start, end } : undefined,
    type: type as TransactionType | undefined,
    categoryId,
    accountId: scalar('accountId'),
    includeChildren: scalar('includeChildren') === '1',
  };
}
