import { fingerprintSource, markDuplicates, normalizeNote } from '../fingerprint';
import type { NormalizedTransaction } from '../types';

function tx(partial: Partial<NormalizedTransaction>): NormalizedTransaction {
  return { direction: 'expense', amountCents: 1000, date: '2026-07-08', ...partial };
}

describe('normalizeNote', () => {
  it('trim + 压缩连续空白为单个空格', () => {
    expect(normalizeNote('  午餐   拉面\t二碗  ')).toBe('午餐 拉面 二碗');
  });
  it('undefined/空串 → 空串', () => {
    expect(normalizeNote(undefined)).toBe('');
    expect(normalizeNote('   ')).toBe('');
  });
});

describe('fingerprintSource', () => {
  it('内容指纹 = 日期前10位|金额分|方向|规范化备注', () => {
    expect(
      fingerprintSource(tx({ date: '2026-07-08 12:30:00', note: ' 午餐  拉面 ' }), 'generic-csv'),
    ).toBe('2026-07-08|1000|expense|午餐 拉面');
  });

  it('无备注时备注段为空', () => {
    expect(fingerprintSource(tx({}), 'generic-csv')).toBe('2026-07-08|1000|expense|');
  });

  it('备注只差空白的两行指纹相同', () => {
    const a = fingerprintSource(tx({ note: '打车  回家' }), 'x');
    const b = fingerprintSource(tx({ note: ' 打车 回家 ' }), 'x');
    expect(a).toBe(b);
  });

  it('sourceId 存在时优先：sid|适配器id|sourceId，与内容无关', () => {
    const a = fingerprintSource(tx({ sourceId: 'NO-123', amountCents: 1 }), 'alipay');
    const b = fingerprintSource(tx({ sourceId: 'NO-123', amountCents: 9999 }), 'alipay');
    expect(a).toBe('sid|alipay|NO-123');
    expect(a).toBe(b);
  });

  it('同 sourceId 不同适配器 → 不同指纹（避免跨源误判）', () => {
    expect(fingerprintSource(tx({ sourceId: '1' }), 'a')).not.toBe(
      fingerprintSource(tx({ sourceId: '1' }), 'b'),
    );
  });

  it('方向/金额/日期任一不同 → 指纹不同', () => {
    const base = fingerprintSource(tx({}), 'x');
    expect(fingerprintSource(tx({ direction: 'income' }), 'x')).not.toBe(base);
    expect(fingerprintSource(tx({ amountCents: 1001 }), 'x')).not.toBe(base);
    expect(fingerprintSource(tx({ date: '2026-07-09' }), 'x')).not.toBe(base);
  });
});

describe('markDuplicates', () => {
  const identityHash = (s: string) => Promise.resolve(`h(${s})`);

  it('库中已有指纹 → duplicate', async () => {
    const rows = [tx({ note: 'a' }), tx({ note: 'b' })];
    const existing = new Set([`h(${fingerprintSource(rows[0]!, 'x')})`]);
    const result = await markDuplicates(rows, 'x', { hash: identityHash, existing });
    expect(result.map((r) => r.duplicate)).toEqual([true, false]);
  });

  it('本批内部重复 → 第二次出现起标记 duplicate', async () => {
    const rows = [tx({ note: 'same' }), tx({ note: 'same' }), tx({ note: 'other' })];
    const result = await markDuplicates(rows, 'x', { hash: identityHash, existing: new Set() });
    expect(result.map((r) => r.duplicate)).toEqual([false, true, false]);
  });

  it('返回每行的指纹（供入库）', async () => {
    const rows = [tx({})];
    const result = await markDuplicates(rows, 'x', { hash: identityHash, existing: new Set() });
    expect(result[0]!.fingerprint).toBe(`h(${fingerprintSource(rows[0]!, 'x')})`);
    expect(result[0]!.row).toBe(rows[0]);
  });
});
