import { adapterRegistry } from '../../adapters';
import { fingerprintSource, markDuplicates } from '../fingerprint';
import { createRegistry } from '../registry';
import type { ImportAdapter, ImportFileContext } from '../types';

/**
 * 框架可扩展性回归测试：内联定义一个 ~10 行的示例适配器，
 * 证明"1 个适配器对象 + 1 行 register"即可接入 —— detectAll 能发现它、
 * parse 输出能走通去重核心（markDuplicates）。
 */

/** 示例适配器：固定返回 2 笔假数据 */
const demoAdapter: ImportAdapter = {
  id: 'demo',
  displayName: '示例账单',
  fileExtensions: ['.txt'],
  detect: async (ctx) => ({ confidence: ctx.fileName.endsWith('.txt') ? 0.9 : 0 }),
  parse: async () => ({
    transactions: [
      { direction: 'expense', amountCents: 1200, date: '2026-07-01', note: '假数据1' },
      { direction: 'income', amountCents: 50000, date: '2026-07-02', note: '假数据2' },
    ],
    issues: [],
  }),
};

function fakeCtx(fileName: string): ImportFileContext {
  return {
    fileName,
    sizeBytes: 10,
    readText: () => Promise.resolve(''),
    readHead: () => Promise.resolve([]),
  };
}

describe('AdapterRegistry', () => {
  it('register + get + getAll', () => {
    const registry = createRegistry();
    registry.register(demoAdapter);
    expect(registry.get('demo')).toBe(demoAdapter);
    expect(registry.getAll()).toHaveLength(1);
  });

  it('重复注册同 id 抛错', () => {
    const registry = createRegistry();
    registry.register(demoAdapter);
    expect(() => registry.register(demoAdapter)).toThrow('demo');
  });

  it('detectAll 发现示例适配器，confidence 降序，0 分与抛错的适配器被忽略', async () => {
    const registry = createRegistry();
    const lowAdapter: ImportAdapter = {
      ...demoAdapter,
      id: 'low',
      detect: async () => ({ confidence: 0.2, reason: '兜底' }),
    };
    const throwingAdapter: ImportAdapter = {
      ...demoAdapter,
      id: 'broken',
      detect: async () => {
        throw new Error('boom');
      },
    };
    const zeroAdapter: ImportAdapter = {
      ...demoAdapter,
      id: 'zero',
      detect: async () => ({ confidence: 0 }),
    };
    registry.register(lowAdapter);
    registry.register(throwingAdapter);
    registry.register(zeroAdapter);
    registry.register(demoAdapter);

    const candidates = await registry.detectAll(fakeCtx('bill.txt'));
    expect(candidates.map((c) => c.adapter.id)).toEqual(['demo', 'low']);
    expect(candidates[0]!.confidence).toBe(0.9);
  });

  it('示例适配器 parse 输出可走通去重流水线', async () => {
    const registry = createRegistry();
    registry.register(demoAdapter);

    const adapter = registry.get('demo')!;
    const parsed = await adapter.parse(fakeCtx('bill.txt'));
    expect(parsed.transactions).toHaveLength(2);

    // 首次导入：无重复
    const hash = (s: string) => Promise.resolve(`sha(${s})`);
    const first = await markDuplicates(parsed.transactions, adapter.id, {
      hash,
      existing: new Set<string>(),
    });
    expect(first.map((r) => r.duplicate)).toEqual([false, false]);

    // 重复导入同一文件：库中已有全部指纹 → 全部标记重复
    const existing = new Set(
      parsed.transactions.map((t) => `sha(${fingerprintSource(t, adapter.id)})`),
    );
    const second = await markDuplicates(parsed.transactions, adapter.id, { hash, existing });
    expect(second.map((r) => r.duplicate)).toEqual([true, true]);
  });
});

describe('真实 adapterRegistry 装配', () => {
  it('generic-csv 兜底适配器已注册，.csv 文件探测为低置信度 0.2', async () => {
    expect(adapterRegistry.getAll().map((a) => a.id)).toContain('generic-csv');
    const candidates = await adapterRegistry.detectAll(fakeCtx('账单.csv'));
    const generic = candidates.find((c) => c.adapter.id === 'generic-csv');
    expect(generic?.confidence).toBe(0.2);
  });

  it('非 .csv 文件时 generic-csv 不出现在候选中', async () => {
    const candidates = await adapterRegistry.detectAll(fakeCtx('bill.xlsx'));
    expect(candidates.find((c) => c.adapter.id === 'generic-csv')).toBeUndefined();
  });
});
