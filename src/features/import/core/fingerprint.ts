import type { NormalizedTransaction } from './types';

/**
 * 去重指纹（纯函数部分，可单测）。
 *
 * - 有 sourceId：指纹源 = `sid|适配器id|sourceId`（源流水号全局唯一，最可靠）
 * - 无 sourceId：指纹源 = `日期前10位|金额分|方向|规范化备注`（内容指纹，
 *   同日同额同向同备注视为同一笔）
 *
 * 实际入库的 fingerprint = sha256Hex(指纹源)，见 dedupe.ts。
 */

/** 备注规范化：trim + 连续空白压缩为单个空格 */
export function normalizeNote(note: string | undefined): string {
  return (note ?? '').trim().replace(/\s+/g, ' ');
}

/** 组装指纹源字符串（纯函数） */
export function fingerprintSource(
  tx: Pick<NormalizedTransaction, 'direction' | 'amountCents' | 'date' | 'note' | 'sourceId'>,
  adapterId: string,
): string {
  if (tx.sourceId) return `sid|${adapterId}|${tx.sourceId}`;
  return `${tx.date.slice(0, 10)}|${tx.amountCents}|${tx.direction}|${normalizeNote(tx.note)}`;
}

export interface DedupeRow {
  row: NormalizedTransaction;
  fingerprint: string;
  duplicate: boolean;
}

/**
 * 标记重复行（去重核心逻辑，hash 与已有指纹集合皆注入，纯逻辑可单测）：
 * - 指纹已存在于库中（含历史导入批次）→ duplicate
 * - 本批内部指纹重复（保留首行）→ duplicate
 */
export async function markDuplicates(
  rows: NormalizedTransaction[],
  adapterId: string,
  opts: {
    hash: (source: string) => Promise<string>;
    existing: ReadonlySet<string>;
  },
): Promise<DedupeRow[]> {
  const fingerprints = await Promise.all(
    rows.map((row) => opts.hash(fingerprintSource(row, adapterId))),
  );
  const seenInBatch = new Set<string>();
  return rows.map((row, i) => {
    const fingerprint = fingerprints[i]!;
    const duplicate = opts.existing.has(fingerprint) || seenInBatch.has(fingerprint);
    seenInBatch.add(fingerprint);
    return { row, fingerprint, duplicate };
  });
}
