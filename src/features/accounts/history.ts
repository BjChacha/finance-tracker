import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { accounts, transactions } from '@/db/schema';
import { dayjs, toDateKey } from '@/lib/date';
import type { DateRange } from '@/lib/analytics-range';
import type { TrendGranularity } from '@/features/stats/transform';
import { listAccountsWithBalance } from './repository';
import { buildAssetHistory, type AssetHistory } from './history-transform';

export async function assetHistoryStart(today: string): Promise<string> {
  const [transactionRow] = await db
    .select({ first: sql<string | null>`MIN(${transactions.dateKey})` })
    .from(transactions)
    .where(sql`${transactions.dateKey} <= ${today}`);
  const [accountRow] = await db
    .select({ first: sql<number | null>`MIN(${accounts.createdAt})` })
    .from(accounts);
  return [
    today,
    transactionRow?.first,
    accountRow?.first == null ? null : toDateKey(accountRow.first),
  ]
    .filter((date): date is string => !!date)
    .sort()[0]!;
}

export async function assetHistory(
  range: DateRange,
  granularity: TrendGranularity,
): Promise<AssetHistory> {
  const openingDate = dayjs(range.start)
    .subtract(1, 'day')
    .format('YYYY-MM-DD');
  const inRange = and(
    sql`${transactions.dateKey} >= ${range.start}`,
    sql`${transactions.dateKey} <= ${range.end}`,
  );
  const [opening, outgoing, incoming] = await Promise.all([
    listAccountsWithBalance({ asOfDate: openingDate }),
    db
      .select({
        accountId: transactions.accountId,
        dateKey: transactions.dateKey,
        delta:
          sql<number>`SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount}
        WHEN ${transactions.type} = 'expense' THEN -${transactions.amount}
        ELSE -(${transactions.amount} + ${transactions.fee}) END)`.mapWith(
            Number,
          ),
      })
      .from(transactions)
      .where(inRange)
      .groupBy(transactions.accountId, transactions.dateKey),
    db
      .select({
        accountId: transactions.toAccountId,
        dateKey: transactions.dateKey,
        delta:
          sql<number>`SUM(COALESCE(${transactions.toAmount}, ${transactions.amount}))`.mapWith(
            Number,
          ),
      })
      .from(transactions)
      .where(and(inRange, eq(transactions.type, 'transfer')))
      .groupBy(transactions.toAccountId, transactions.dateKey),
  ]);
  return buildAssetHistory(
    opening,
    [
      ...outgoing,
      ...incoming.flatMap((row) =>
        row.accountId ? [{ ...row, accountId: row.accountId }] : [],
      ),
    ],
    range,
    granularity,
  );
}
