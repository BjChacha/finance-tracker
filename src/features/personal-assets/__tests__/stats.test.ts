import type { AssetStatus, PersonalAsset } from '@/db/schema';
import {
  assetHealth,
  categoryBreakdown,
  computeAssetStats,
  costTrend,
  countByStatus,
  ownedAt,
  realizedGainTrend,
  topAssets,
} from '../stats';

let seq = 0;

function asset(partial: Partial<PersonalAsset> = {}): PersonalAsset {
  seq += 1;
  return {
    id: partial.id ?? `pa-${seq}`,
    name: partial.name ?? `资产${seq}`,
    category: partial.category ?? 'electronics',
    icon: 'smartphone',
    color: '#3B82F6',
    quantity: 1,
    costCents: 100000,
    status: 'holding',
    acquiredDateKey: '2026-01-10',
    closedDateKey: null,
    soldCents: null,
    soldTransactionId: null,
    installmentPeriods: 0,
    installmentDownPaymentCents: 0,
    installmentInterestCents: 0,
    installmentAnnualRateScaled: null,
    installmentFirstDueDateKey: null,
    installmentAccountId: null,
    installmentCategoryId: null,
    installmentRuleId: null,
    installmentAutoCreate: 1,
    installmentClosedDateKey: null,
    installmentDownPaymentTransactionId: null,
    note: '',
    sourceTransactionId: null,
    createdAt: 1768000000000 + seq,
    updatedAt: 1768000000000 + seq,
    ...partial,
  };
}

describe('computeAssetStats', () => {
  it('空列表给出全零', () => {
    expect(computeAssetStats([])).toEqual({
      counts: { all: 0, holding: 0, sold: 0, disposed: 0 },
      holdingCostCents: 0,
      totalCostCents: 0,
      realizedGainCents: 0,
      soldProceedsCents: 0,
    });
  });

  it('持有成本/累计投入/已实现收益按成本口径', () => {
    const stats = computeAssetStats([
      asset({ costCents: 10000 }),
      asset({ costCents: 5000 }),
      asset({ status: 'sold', costCents: 8000, soldCents: 9000, closedDateKey: '2026-02-01' }),
      asset({ status: 'disposed', costCents: 2000, closedDateKey: '2026-03-01' }),
    ]);
    expect(stats.counts).toEqual({ all: 4, holding: 2, sold: 1, disposed: 1 });
    expect(stats.holdingCostCents).toBe(15000);
    expect(stats.totalCostCents).toBe(25000);
    // 出售 +1000，处置 -2000
    expect(stats.realizedGainCents).toBe(-1000);
    expect(stats.soldProceedsCents).toBe(9000);
  });

  it('countByStatus 分类计数', () => {
    const counts = countByStatus([
      asset(),
      asset({ status: 'sold' }),
      asset({ status: 'disposed' }),
    ]);
    expect(counts).toEqual({ holding: 1, sold: 1, disposed: 1 });
  });

  it('出售未填所得按 0 计（净亏全部成本）', () => {
    const stats = computeAssetStats([asset({ status: 'sold', costCents: 5000, soldCents: null })]);
    expect(stats.realizedGainCents).toBe(-5000);
  });
});

describe('categoryBreakdown', () => {
  it('现役资产按成本聚合，零成本与已退出不计', () => {
    const slices = categoryBreakdown([
      asset({ category: 'electronics', costCents: 30000 }),
      asset({ category: 'electronics', costCents: 10000 }),
      asset({ category: 'vehicle', costCents: 50000 }),
      asset({ category: 'jewelry', costCents: 0 }),
      asset({ status: 'sold', category: 'vehicle', costCents: 99999 }),
    ]);
    expect(slices).toEqual([
      { id: 'vehicle', label: '车辆出行', value: 50000, color: '#EF4444' },
      { id: 'electronics', label: '电子数码', value: 40000, color: '#3B82F6' },
    ]);
  });

  it('二级分类并入父类聚合', () => {
    const slices = categoryBreakdown([
      asset({ category: 'phone', costCents: 20000 }),
      asset({ category: 'tablet', costCents: 30000 }),
      asset({ category: 'electronics', costCents: 10000 }),
    ]);
    expect(slices).toEqual([
      { id: 'electronics', label: '电子数码', value: 60000, color: '#3B82F6' },
    ]);
  });
});

describe('topAssets', () => {
  it('按成本降序、pct 为占持有成本比、可截断', () => {
    const items = topAssets(
      [
        asset({ id: 'a', name: 'A', costCents: 10000 }),
        asset({ id: 'b', name: 'B', costCents: 30000 }),
        asset({ id: 'c', name: 'C', costCents: 10000 }),
        asset({ id: 'd', name: 'D', status: 'sold', costCents: 999999 }),
      ],
      2,
    );
    expect(items.map((i) => i.id)).toEqual(['b', 'a']);
    expect(items[0]!.pct).toBe(60);
    expect(items[1]!.pct).toBe(20);
  });
});

describe('ownedAt', () => {
  it('取得前不归持有、退出后不归持有', () => {
    const a = asset({
      acquiredDateKey: '2026-01-10',
      status: 'sold',
      closedDateKey: '2026-03-01',
    });
    expect(ownedAt(a, '2026-01-09')).toBe(false);
    expect(ownedAt(a, '2026-02-01')).toBe(true);
    expect(ownedAt(a, '2026-03-01')).toBe(false);
  });
});

describe('costTrend', () => {
  const refKey = '2026-06-15';

  it('输出连续月份点，无资产时全零', () => {
    const points = costTrend([], 3, refKey);
    expect(points.map((p) => p.label)).toEqual(['26/4', '26/5', '26/6']);
    expect(points.every((p) => p.costCents === 0 && p.count === 0 && p.avgCostCents === 0)).toBe(true);
  });

  it('月中加入的资产只从当月开始计入成本', () => {
    const a = asset({ acquiredDateKey: '2026-05-20', costCents: 8000 });
    const points = costTrend([a], 3, refKey);
    expect(points.map((p) => p.costCents)).toEqual([0, 8000, 8000]);
    expect(points.map((p) => p.count)).toEqual([0, 1, 1]);
    expect(points.map((p) => p.avgCostCents)).toEqual([0, 8000, 8000]);
  });

  it('多件资产时单件均值为成本合计除以件数', () => {
    const a = asset({ acquiredDateKey: '2026-01-01', costCents: 1000 });
    const b = asset({ acquiredDateKey: '2026-01-05', costCents: 3000 });
    const points = costTrend([a, b], 1, refKey);
    expect(points[0]!.count).toBe(2);
    expect(points[0]!.avgCostCents).toBe(2000);
  });

  it('出售后组合不再计入该资产成本', () => {
    const a = asset({
      acquiredDateKey: '2026-01-05',
      status: 'sold',
      closedDateKey: '2026-05-31',
      costCents: 10000,
      soldCents: 11000,
    });
    const points = costTrend([a], 3, refKey);
    expect(points.map((p) => p.costCents)).toEqual([10000, 0, 0]);
    expect(points.map((p) => p.count)).toEqual([1, 0, 0]);
  });
});

describe('realizedGainTrend', () => {
  it('只统计已退出且闭合日期 ≤ 时点的资产收益', () => {
    const sold = asset({
      acquiredDateKey: '2025-06-01',
      status: 'sold',
      closedDateKey: '2026-05-20',
      costCents: 10000,
      soldCents: 12000,
    });
    const disposed = asset({
      acquiredDateKey: '2025-06-01',
      status: 'disposed',
      closedDateKey: '2026-06-10',
      costCents: 4000,
    });
    const holding = asset({ acquiredDateKey: '2025-06-01', costCents: 5000 });
    const points = realizedGainTrend([sold, disposed, holding], 3, '2026-06-15');
    // 26/4 月末：无闭合资产 → 0；26/5 月末：出售已闭合 → +2000；26/6（今天）：处置闭合 → +2000−4000
    expect(points.map((p) => p.realizedGainCents)).toEqual([0, 2000, -2000]);
  });

  it('空列表全零', () => {
    expect(realizedGainTrend([], 2, '2026-06-15').map((p) => p.realizedGainCents)).toEqual([0, 0]);
  });
});

describe('assetHealth', () => {
  const refKey = '2026-06-15';

  it('统计持有/新增/退出件数', () => {
    const old = asset({ acquiredDateKey: '2025-01-01' });
    const recent = asset({ acquiredDateKey: '2026-06-01' });
    const exited = asset({
      acquiredDateKey: '2025-06-01',
      status: 'sold',
      closedDateKey: '2026-05-01',
    });
    const health = assetHealth([old, recent, exited], refKey);
    expect(health.holdingCount).toBe(2);
    // 仅 2026-06-01 取得的资产在近 12 个月内（2025-01-01 / 2025-06-01 均超窗）
    expect(health.addedLastYear).toBe(1);
    expect(health.exitedLastYear).toBe(1);
  });

  it('加权平均持有时长按成本加权', () => {
    // 旧资产 530 天、成本 100000；新资产 14 天、成本 300000 → 加权 ≈ (530*100000+14*300000)/400000 ≈ 143.0
    const old = asset({ acquiredDateKey: '2025-01-01', costCents: 100000 });
    const recent = asset({ acquiredDateKey: '2026-06-01', costCents: 300000 });
    const health = assetHealth([old, recent], refKey);
    expect(health.weightedAvgHoldingDays).toBe(143);
  });

  it('无持有资产时平均持有时长为 0', () => {
    const health = assetHealth([asset({ status: 'sold', closedDateKey: '2025-01-01' })], refKey);
    expect(health.holdingCount).toBe(0);
    expect(health.weightedAvgHoldingDays).toBe(0);
  });
});
