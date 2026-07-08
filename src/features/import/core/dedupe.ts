import { inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { transactions } from '@/db/schema';
import { sha256Hex } from '@/lib/id';
import { markDuplicates, type DedupeRow } from './fingerprint';
import type { NormalizedTransaction } from './types';

export type { DedupeRow } from './fingerprint';

/** 查询库中已存在的指纹（含历史导入与手动记账），IN 列表分块避免变量上限 */
async function fetchExistingFingerprints(fingerprints: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  const CHUNK = 400;
  for (let i = 0; i < fingerprints.length; i += CHUNK) {
    const chunk = fingerprints.slice(i, i + CHUNK);
    const rows = await db
      .select({ fingerprint: transactions.fingerprint })
      .from(transactions)
      .where(inArray(transactions.fingerprint, chunk));
    for (const r of rows) if (r.fingerprint) existing.add(r.fingerprint);
  }
  return existing;
}

/**
 * 去重：先算全部行的指纹，再对照库中已有指纹 + 本批内部重复，
 * 返回每行 { row, fingerprint, duplicate }。
 */
export async function dedupe(
  rows: NormalizedTransaction[],
  adapterId: string,
): Promise<DedupeRow[]> {
  // 第一遍用真实 hash 算指纹（结果被 markDuplicates 复用，见其实现）
  const prelim = await markDuplicates(rows, adapterId, { hash: sha256Hex, existing: new Set() });
  const existing = await fetchExistingFingerprints(prelim.map((r) => r.fingerprint));
  return prelim.map((r) => ({
    ...r,
    duplicate: r.duplicate || existing.has(r.fingerprint),
  }));
}
