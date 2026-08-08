import { desc, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { transactions } from '@/db/schema';
import { getSetting, setSetting } from '@/db/settings';
import { dayjs } from '@/lib/date';
import {
  BASELINE_WINDOW_DAYS,
  buildBaseline,
  shouldRebuild,
  type Baseline,
  type BaselineRow,
  type StoredBaseline,
  type TxSignature,
} from './model';

const BASELINE_KEY = 'suggest.baseline';
/** 重建时最多回看的交易行数,防御超大数据量 */
const MAX_BASELINE_ROWS = 5000;

/* ---------------------------------- 基线 ---------------------------------- */

/** Any transaction change invalidates the shared category/account baseline. */
async function txSignature(): Promise<TxSignature> {
  const [row] = await db
    .select({
      count: sql<number>`COUNT(*)`.mapWith(Number),
      maxUpdatedAt: sql<number>`COALESCE(MAX(${transactions.updatedAt}), 0)`.mapWith(Number),
    })
    .from(transactions);
  return row ?? { count: 0, maxUpdatedAt: 0 };
}

/** Fetch the minimal projection used by every suggestion target kind. */
async function fetchBaselineRows(): Promise<BaselineRow[]> {
  const sinceKey = dayjs().subtract(BASELINE_WINDOW_DAYS, 'day').format('YYYY-MM-DD');
  const rows = await db
    .select({
      type: transactions.type,
      categoryId: transactions.categoryId,
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
      amount: transactions.amount,
      dateKey: transactions.dateKey,
    })
    .from(transactions)
    .where(sql`${transactions.dateKey} >= ${sinceKey}`)
    .orderBy(desc(transactions.dateKey))
    .limit(MAX_BASELINE_ROWS);

  return rows;
}

/**
 * 返回可用基线:存储有效且交易签名未变时直接返回,
 * 否则从近 6 个月交易重建并写回 settings(幂等,作为 react-query 的 queryFn 使用)。
 */
export async function ensureBaseline(): Promise<Baseline> {
  const [raw, sig] = await Promise.all([getSetting<StoredBaseline>(BASELINE_KEY), txSignature()]);
  const stored =
    raw?.baseline?.entries &&
    raw.baseline.accountEntries &&
    Array.isArray(raw.baseline.transferPairs) &&
    raw.meta
      ? raw
      : null;
  if (stored !== null && !shouldRebuild(stored, sig)) return stored.baseline;

  const baseline = buildBaseline(await fetchBaselineRows());
  await setSetting(BASELINE_KEY, {
    baseline,
    meta: { builtAt: Date.now(), txCount: sig.count, maxUpdatedAt: sig.maxUpdatedAt },
  } satisfies StoredBaseline);
  return baseline;
}
