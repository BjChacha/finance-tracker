import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { settings, transactions } from '@/db/schema';
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

/* -------- settings 读写(与 backup/repository.ts 同模式,后续可统一抽公共层) -------- */

async function getSetting<T>(key: string): Promise<T | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  const raw = rows[0]?.value;
  if (raw === undefined) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function setSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } });
}

/* ---------------------------------- 基线 ---------------------------------- */

/** 交易签名:有分类交易的笔数 + 最后更新时间,任一变化即触发基线重建 */
async function txSignature(): Promise<TxSignature> {
  const [row] = await db
    .select({
      count: sql<number>`COUNT(*)`.mapWith(Number),
      maxUpdatedAt: sql<number>`COALESCE(MAX(${transactions.updatedAt}), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(isNotNull(transactions.categoryId));
  return row ?? { count: 0, maxUpdatedAt: 0 };
}

/** 窗口内有分类的交易最小投影(含周期自动生成的交易,同样是真实的金额→分类证据) */
async function fetchBaselineRows(): Promise<BaselineRow[]> {
  const sinceKey = dayjs().subtract(BASELINE_WINDOW_DAYS, 'day').format('YYYY-MM-DD');
  const rows = await db
    .select({
      type: transactions.type,
      categoryId: transactions.categoryId,
      amount: transactions.amount,
      dateKey: transactions.dateKey,
    })
    .from(transactions)
    .where(and(isNotNull(transactions.categoryId), sql`${transactions.dateKey} >= ${sinceKey}`))
    .orderBy(desc(transactions.dateKey))
    .limit(MAX_BASELINE_ROWS);

  const result: BaselineRow[] = [];
  for (const r of rows) {
    if (r.type === 'transfer' || r.categoryId === null) continue; // 类型收窄;transfer 实际已被 isNotNull 排除
    result.push({ type: r.type, categoryId: r.categoryId, amount: r.amount, dateKey: r.dateKey });
  }
  return result;
}

/**
 * 返回可用基线:存储有效且交易签名未变时直接返回,
 * 否则从近 6 个月交易重建并写回 settings(幂等,作为 react-query 的 queryFn 使用)。
 */
export async function ensureBaseline(): Promise<Baseline> {
  const [raw, sig] = await Promise.all([getSetting<StoredBaseline>(BASELINE_KEY), txSignature()]);
  const stored = raw?.baseline?.entries && raw.meta ? raw : null; // 防御旧数据/损坏 JSON
  if (stored !== null && !shouldRebuild(stored, sig)) return stored.baseline;

  const baseline = buildBaseline(await fetchBaselineRows());
  await setSetting(BASELINE_KEY, {
    baseline,
    meta: { builtAt: Date.now(), txCount: sig.count, maxUpdatedAt: sig.maxUpdatedAt },
  } satisfies StoredBaseline);
  return baseline;
}
