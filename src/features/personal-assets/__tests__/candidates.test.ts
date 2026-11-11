// Pure-function tests: stub the db client so importing repository does not
// initialise expo-sqlite (unavailable under jest/node).
jest.mock('@/db/client', () => ({ db: {} }));

import type { TxListItem } from '@/features/transactions/repository';
import {
  ALL_TIME_RANGE_DAYS,
  CANDIDATE_DEFAULT_RANGE_DAYS,
  CANDIDATE_LIMIT,
  CANDIDATE_MIN_SCORE,
  candidateRange,
  guessAssetCategory,
  ignoredKeyOf,
  mergeIgnoredCandidateIds,
  normalizeCandidateRangeDays,
  pickAssetCandidates,
  scoreAssetCandidate,
  shouldRebuildCandidatesCache,
  transactionToAssetInput,
  viewAssetCandidates,
  type AssetCandidate,
  type CandidatesCacheSignature,
  type StoredCandidatesCache,
} from '../candidates';
import { validateAssetInput } from '../repository';

let seq = 0;

function tx(partial: Partial<TxListItem> = {}): TxListItem {
  seq += 1;
  return {
    id: `tx-${seq}`,
    type: 'expense',
    amount: 1000,
    fee: 0,
    accountId: 'acc-1',
    toAccountId: null,
    categoryId: 'cat-1',
    date: Date.parse('2026-11-01T12:00:00+08:00'),
    dateKey: '2026-11-01',
    note: '',
    currency: 'CNY',
    exchangeRate: 1_000_000,
    amountBaseCents: 1000,
    toAmount: null,
    categoryName: '其他支出',
    categoryIcon: 'package',
    categoryColor: '#9CA3AF',
    parentCategoryName: null,
    projectId: null,
    projectName: null,
    projectIcon: null,
    projectColor: null,
    accountName: '现金',
    toAccountName: null,
    ...partial,
  };
}

describe('normalizeCandidateRangeDays / candidateRange', () => {
  it('非法或越界天数回落默认窗口；0 = 所有', () => {
    expect(normalizeCandidateRangeDays(undefined)).toBe(CANDIDATE_DEFAULT_RANGE_DAYS);
    expect(normalizeCandidateRangeDays(Number.NaN)).toBe(CANDIDATE_DEFAULT_RANGE_DAYS);
    expect(normalizeCandidateRangeDays(0)).toBe(ALL_TIME_RANGE_DAYS);
    expect(normalizeCandidateRangeDays(0.4)).toBe(ALL_TIME_RANGE_DAYS);
    expect(normalizeCandidateRangeDays(365)).toBe(365);
    expect(normalizeCandidateRangeDays(0)).toBe(0);
    expect(normalizeCandidateRangeDays(-30)).toBe(1);
    expect(normalizeCandidateRangeDays(9999)).toBe(365);
    expect(normalizeCandidateRangeDays(30.9)).toBe(30);
  });

  it('近 N 天为含今天的闭区间', () => {
    expect(candidateRange(90, '2026-11-08')).toEqual({
      start: '2026-08-11',
      end: '2026-11-08',
    });
    expect(candidateRange(1, '2026-11-08')).toEqual({
      start: '2026-11-08',
      end: '2026-11-08',
    });
  });

  it('「所有」返回全零起点哨兵，任何 dateKey 都落在区间内', () => {
    expect(candidateRange(0, '2026-11-08')).toEqual({ start: '0000-01-01', end: '2026-11-08' });
    expect('2000-01-01' >= candidateRange(0).start).toBe(true);
  });
});

describe('scoreAssetCandidate', () => {
  it('非支出永不入选', () => {
    expect(scoreAssetCandidate(tx({ type: 'income', amountBaseCents: 100_000_000 }))).toBeNull();
    expect(scoreAssetCandidate(tx({ type: 'transfer', amountBaseCents: 100_000_000 }))).toBeNull();
  });

  it('仅大额即可成为候选', () => {
    const scored = scoreAssetCandidate(tx({ amountBaseCents: 600_000 }));
    expect(scored).toEqual({ score: 50, reasons: ['large'] });
  });

  it('金额阶梯取最高一档', () => {
    expect(scoreAssetCandidate(tx({ amountBaseCents: 199_999 }))?.score).toBe(30);
    expect(scoreAssetCandidate(tx({ amountBaseCents: 200_000 }))?.score).toBe(40);
    expect(scoreAssetCandidate(tx({ amountBaseCents: 49_999 }))?.score).toBe(20);
    expect(scoreAssetCandidate(tx({ amountBaseCents: 9_999 }))?.score).toBe(0);
  });

  it('类别相关加分并标记原因', () => {
    const scored = scoreAssetCandidate(
      tx({ amountBaseCents: 20_000, categoryName: '数码' }),
    );
    expect(scored?.score).toBe(10 + 25);
    expect(scored?.reasons).toEqual(['category']);
  });

  it('日常消费类别减分（大额仍可能不到阈值）', () => {
    const scored = scoreAssetCandidate(
      tx({ amountBaseCents: 1_200_000, categoryName: '餐饮', note: '午餐' }),
    );
    expect(scored?.score).toBe(50 - 35 - 35);
    expect(scored?.reasons).toEqual(['large']);
  });

  it('备注中的资产名词加分', () => {
    const scored = scoreAssetCandidate(
      tx({ amountBaseCents: 20_000, categoryName: '其他支出', note: '买了一个新耳机' }),
    );
    expect(scored?.score).toBe(10 + 30);
    expect(scored?.reasons).toEqual(['keyword']);
  });

  it('会员/年费类关键词只加中等奖分', () => {
    const scored = scoreAssetCandidate(
      tx({ amountBaseCents: 300_000, categoryName: '通讯', note: '视频会员年费' }),
    );
    expect(scored?.score).toBe(40 + 15);
    expect(scored?.reasons).toEqual(['large', 'keyword']);
  });

  it('周期记账扣分', () => {
    const withoutRecurring = scoreAssetCandidate(tx({ amountBaseCents: 300_000 }))?.score;
    const withRecurring = scoreAssetCandidate(
      tx({ amountBaseCents: 300_000, recurringRuleId: 'rule-1' }),
    )?.score;
    expect(withoutRecurring).toBe(40);
    expect(withRecurring).toBe(20);
  });
});

describe('pickAssetCandidates', () => {
  it('排除非支出、已生成过资产与已忽略的交易', () => {
    const expense = tx({ amountBaseCents: 600_000 });
    const income = tx({ type: 'income', amountBaseCents: 600_000 });
    const linked = tx({ amountBaseCents: 600_000 });
    const ignored = tx({ amountBaseCents: 600_000 });

    const picked = pickAssetCandidates([expense, income, linked, ignored], {
      linkedTransactionIds: [linked.id],
      ignoredTransactionIds: new Set([ignored.id]),
    });
    expect(picked.map((c) => c.transaction.id)).toEqual([expense.id]);
  });

  it('低于阈值不入选', () => {
    const small = tx({ amountBaseCents: 9_999 });
    expect(pickAssetCandidates([small])).toEqual([]);
    expect(pickAssetCandidates([small], { minScore: 0 })).toHaveLength(1);
  });

  it('按分数 → 金额 → 日期排序并截断', () => {
    const low = tx({ amountBaseCents: 1_200_000, categoryName: '餐饮', note: '午餐' }); // -20
    const mid = tx({ amountBaseCents: 600_000 }); // 50
    const high = tx({ amountBaseCents: 600_000, categoryName: '数码', note: '耳机' }); // 50+25+30
    const sameScoreBigger = tx({ amountBaseCents: 700_000 }); // 50
    const picked = pickAssetCandidates([low, mid, high, sameScoreBigger], { limit: 3 });
    expect(picked.map((c) => c.transaction.id)).toEqual([
      high.id,
      sameScoreBigger.id,
      mid.id,
    ]);
    expect(picked[0]!.score).toBe(105);
  });

  it('默认阈值与默认上限生效', () => {
    const many = Array.from({ length: 40 }, () => tx({ amountBaseCents: 600_000 }));
    expect(pickAssetCandidates(many)).toHaveLength(30);
    expect(pickAssetCandidates(many)[0]!.score).toBeGreaterThanOrEqual(CANDIDATE_MIN_SCORE);
  });
});

describe('guessAssetCategory', () => {
  it('分类名优先、备注次之', () => {
    expect(guessAssetCategory(tx({ categoryName: '数码', note: '' }))).toBe('electronics');
    expect(guessAssetCategory(tx({ categoryName: '购物', note: '买了沙发' }))).toBe('home');
    expect(guessAssetCategory(tx({ categoryName: '其他支出', note: '视频会员' }))).toBe(
      'subscription',
    );
    expect(guessAssetCategory(tx({ categoryName: '其他支出', note: '手办预售' }))).toBe(
      'investment',
    );
  });

  it('未命中归入其他', () => {
    expect(guessAssetCategory(tx({ categoryName: '其他支出', note: '无' }))).toBe('other');
  });
});

describe('transactionToAssetInput', () => {
  it('名称取备注，空则分类名，再空用「资产」', () => {
    expect(transactionToAssetInput(tx({ note: '买了个键盘', categoryName: '数码' })).name).toBe(
      '买了个键盘',
    );
    expect(transactionToAssetInput(tx({ note: '   ', categoryName: '数码' })).name).toBe('数码');
    expect(transactionToAssetInput(tx({ note: '', categoryName: null })).name).toBe('资产');
  });

  it('超长备注截断到 40 字', () => {
    const longNote = '买'.repeat(80);
    expect(transactionToAssetInput(tx({ note: longNote })).name).toHaveLength(40);
  });

  it('金额取本位币分、日期取交易日期、回填来源交易', () => {
    const source = tx({
      amountBaseCents: 899_900,
      dateKey: '2026-10-20',
      categoryName: '数码',
      note: 'iPad',
    });
    const input = transactionToAssetInput(source);
    expect(input).toMatchObject({
      category: 'electronics',
      quantity: 1,
      costCents: 899_900,
      acquiredDateKey: '2026-10-20',
      sourceTransactionId: source.id,
    });
    expect(validateAssetInput(input)).toBeNull();
  });
});

describe('mergeIgnoredCandidateIds', () => {
  it('追加去重、新 id 置末尾、超限裁旧', () => {
    expect(mergeIgnoredCandidateIds(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(mergeIgnoredCandidateIds(['a', 'b', 'c'], 'b')).toEqual(['a', 'c', 'b']);
    expect(mergeIgnoredCandidateIds(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd']);
  });
});

describe('viewAssetCandidates', () => {
  const today = '2026-11-08';
  function base(): AssetCandidate[] {
    // 模拟评分基底：按分数降序，日期分散在不同时间窗
    return pickAssetCandidates(
      [
        tx({ amountBaseCents: 600_000, dateKey: '2026-11-01', note: '耳机' }), // 105
        tx({ amountBaseCents: 600_000, dateKey: '2026-10-20', note: '键盘' }), // 105
        tx({ amountBaseCents: 600_000, dateKey: '2026-09-01', note: '显示器' }), // 105
        tx({ amountBaseCents: 600_000, dateKey: '2026-03-04', note: '相机' }), // 105（一年前）
        tx({ amountBaseCents: 600_000, dateKey: '2024-06-01', note: '笔记本电脑' }), // 105（所有）
      ],
      { limit: 100 },
    );
  }

  it('按时间窗过滤；score 序保持基底排名', () => {
    const items = base();
    // today=2026-11-08：11-01(7天前)、10-20(19天前)在近30天；09-01(68天前)出窗
    expect(
      viewAssetCandidates(items, 30, { today, sort: 'score' }).map((c) => c.transaction.note),
    ).toEqual(['耳机', '键盘']);
    expect(
      viewAssetCandidates(items, 365, { today, sort: 'score' }).map((c) => c.transaction.note),
    ).toEqual(['耳机', '键盘', '显示器', '相机']);
  });

  it('date-desc：最新在前，同日按分数次序', () => {
    const items = pickAssetCandidates(
      [
        tx({ amountBaseCents: 600_000, dateKey: '2026-11-01', note: '新耳机' }), // 80 新
        tx({ amountBaseCents: 600_000, dateKey: '2026-11-01', note: '' }), // 50 同日低分
        tx({ amountBaseCents: 600_000, dateKey: '2026-10-20', note: '旧耳机' }), // 80 较早
      ],
      { limit: 100 },
    );
    // 基底按分数：两个 80 分在前（同分按日期新→旧），50 分同日垫底
    expect(items.map((c) => c.transaction.note || '(无备注)')).toEqual([
      '新耳机',
      '旧耳机',
      '(无备注)',
    ]);
    // 时间序：同日按分数（新耳机 > 无备注），再按日期（11-01 > 10-20）
    expect(
      viewAssetCandidates(items, 365, { today, sort: 'date-desc' }).map(
        (c) => c.transaction.note || '(无备注)',
      ),
    ).toEqual(['新耳机', '(无备注)', '旧耳机']);
  });

  it('「所有」不过滤日期', () => {
    const notes = viewAssetCandidates(base(), ALL_TIME_RANGE_DAYS, { today, sort: 'score' }).map(
      (c) => c.transaction.note,
    );
    expect(notes).toEqual(['耳机', '键盘', '显示器', '相机', '笔记本电脑']);
  });

  it('默认截断 CANDIDATE_LIMIT 条，可自定义', () => {
    const many = pickAssetCandidates(
      Array.from({ length: 40 }, (_, i) => tx({ amountBaseCents: 600_000, dateKey: `2026-10-${String((i % 28) + 1).padStart(2, '0')}` })),
      { limit: 100 },
    );
    expect(many.length).toBeGreaterThan(CANDIDATE_LIMIT);
    expect(viewAssetCandidates(many, ALL_TIME_RANGE_DAYS, { today })).toHaveLength(CANDIDATE_LIMIT);
    expect(viewAssetCandidates(many, ALL_TIME_RANGE_DAYS, { today, limit: 5 })).toHaveLength(5);
  });

  it('非法天数归一化后仍正确切窗', () => {
    expect(
      viewAssetCandidates(base(), Number.NaN, { today, sort: 'score' }).map((c) => c.transaction.note),
    ).toEqual(viewAssetCandidates(base(), 90, { today, sort: 'score' }).map((c) => c.transaction.note));
  });
});

describe('ignoredKeyOf / shouldRebuildCandidatesCache', () => {
  const signature: CandidatesCacheSignature = {
    txCount: 10,
    txMaxUpdatedAt: 100,
    assetCount: 2,
    assetMaxUpdatedAt: 200,
    ignoredKey: ignoredKeyOf(['a', 'b']),
  };

  function storedWith(overrides: Partial<CandidatesCacheSignature>): StoredCandidatesCache {
    return { v: 1, meta: { ...signature, ...overrides }, savedAt: 1, items: [] };
  }

  it('指纹确定且与顺序无关，空列表稳定', () => {
    expect(ignoredKeyOf(['a', 'b'])).toBe(ignoredKeyOf(['b', 'a']));
    expect(ignoredKeyOf(['a', 'b'])).not.toBe(ignoredKeyOf(['a', 'c']));
    expect(ignoredKeyOf([])).toBe(ignoredKeyOf([]));
    expect(ignoredKeyOf([])).not.toBe(ignoredKeyOf(['a']));
  });

  it('无缓存或版本不符时重建', () => {
    expect(shouldRebuildCandidatesCache(null, signature)).toBe(true);
    expect(
      shouldRebuildCandidatesCache({ v: 99 as 1, meta: signature, savedAt: 1, items: [] }, signature),
    ).toBe(true);
  });

  it('签名任一字段变化都触发重建', () => {
    expect(shouldRebuildCandidatesCache(storedWith({}), signature)).toBe(false);
    expect(shouldRebuildCandidatesCache(storedWith({ txCount: 11 }), signature)).toBe(true);
    expect(shouldRebuildCandidatesCache(storedWith({ txMaxUpdatedAt: 101 }), signature)).toBe(true);
    expect(shouldRebuildCandidatesCache(storedWith({ assetCount: 3 }), signature)).toBe(true);
    expect(shouldRebuildCandidatesCache(storedWith({ assetMaxUpdatedAt: 201 }), signature)).toBe(true);
    expect(shouldRebuildCandidatesCache(storedWith({ ignoredKey: 'x' }), signature)).toBe(true);
  });
});
