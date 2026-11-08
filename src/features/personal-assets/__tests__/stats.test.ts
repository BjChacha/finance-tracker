import type { AssetStatus, AssetValuation, PersonalAsset } from '@/db/schema';
import {
  assetHealth,
  assetValueAt,
  categoryBreakdown,
  computeAssetStats,
  countByStatus,
  ownedAt,
  portfolioTrend,
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
    currentValueCents: 100000,
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

function valuation(assetId: string, valueCents: number, dateKey: string, createdAt = 1): AssetValuation {
  seq += 1;
  return { id: `val-${seq}`, assetId, valueCents, dateKey, note: '', createdAt };
}

describe('computeAssetStats', () => {
  it('空列表给出全零', () => {
    expect(computeAssetStats([])).toEqual({
      counts: { all: 0, holding: 0, sold: 0, disposed: 0 },
      holdingMarketValueCents: 0,
      holdingCostCents: 0,
      unrealizedGainCents: 0,
      realizedGainCents: 0,
      soldProceedsCents: 0,
    });
  });

  it('持有市值/成本/浮动盈亏只统计 holding', () => {
    const stats = computeAssetStats([
      asset({ costCents: 10000, currentValueCents: 12000 }),
      asset({ costCents: 5000, currentValueCents: 4000 }),
      asset({ status: 'sold', costCents: 8000, currentValueCents: 0, soldCents: 9000, closedDateKey: '2026-02-01' }),
      asset({ status: 'disposed', costCents: 2000, currentValueCents: 0, closedDateKey: '2026-03-01' }),
    ]);
    expect(stats.counts).toEqual({ all: 4, holding: 2, sold: 1, disposed: 1 });
    expect(stats.holdingMarketValueCents).toBe(16000);
    expect(stats.holdingCostCents).toBe(15000);
    expect(stats.unrealizedGainCents).toBe(1000);
    expect(stats.soldProceedsCents).toBe(9000);
    // 出售净赚 1000，处置全损 -2000
    expect(stats.realizedGainCents).toBe(-1000);
  });

  it('countByStatus 与 stats 口径一致', () => {
    expect(countByStatus([asset(), asset({ status: 'sold' }), asset({ status: 'sold' })])).toEqual({
      holding: 1,
      sold: 2,
      disposed: 0,
    });
  });
});

describe('categoryBreakdown / topAssets', () => {
  it('按类别汇总持有市值，剔除零值与已退出资产，降序', () => {
    const slices = categoryBreakdown([
      asset({ category: 'electronics', currentValueCents: 30000 }),
      asset({ category: 'electronics', currentValueCents: 10000 }),
      asset({ category: 'vehicle', currentValueCents: 50000 }),
      asset({ category: 'jewelry', currentValueCents: 0 }),
      asset({ status: 'sold', category: 'vehicle', currentValueCents: 99999 }),
    ]);
    expect(slices.map((s) => [s.id, s.value])).toEqual([
      ['vehicle', 50000],
      ['electronics', 40000],
    ]);
    expect(slices[0]).toMatchObject({ label: '车辆出行', color: '#EF4444' });
  });

  it('topAssets 给出占比（1 位小数）且按市值降序截断', () => {
    const items = topAssets(
      [
        asset({ id: 'a', name: 'A', currentValueCents: 10000, icon: 'x', color: '#000000' }),
        asset({ id: 'b', name: 'B', currentValueCents: 30000 }),
        asset({ id: 'c', name: 'C', currentValueCents: 10000 }),
        asset({ id: 'd', name: 'D', status: 'sold', currentValueCents: 999999 }),
      ],
      2,
    );
    expect(items.map((i) => i.id)).toEqual(['b', 'a']);
    expect(items[0]!.total).toBe(30000);
    expect(items[0]!.pct).toBe(60);
    expect(items[1]!.pct).toBe(20);
  });
});

describe('ownedAt / assetValueAt', () => {
  it('取得前不持有；退出后不持有', () => {
    const a = asset({ acquiredDateKey: '2026-01-10', status: 'sold', closedDateKey: '2026-03-01' });
    expect(ownedAt(a, '2026-01-09')).toBe(false);
    expect(ownedAt(a, '2026-01-10')).toBe(true);
    expect(ownedAt(a, '2026-02-28')).toBe(true);
    expect(ownedAt(a, '2026-03-01')).toBe(false);
  });

  it('无估值记录时回落成本；有记录取 ≤dateKey 最近一条（同日取后建）', () => {
    const a = asset({ id: 'pa-v', costCents: 5000 });
    const valuations = [
      valuation('pa-v', 6000, '2026-02-01', 10),
      valuation('pa-v', 5500, '2026-02-01', 20),
      valuation('pa-v', 7000, '2026-04-01', 30),
    ];
    expect(assetValueAt(a, valuations, '2026-01-15')).toBe(5000);
    expect(assetValueAt(a, valuations, '2026-02-01')).toBe(5500);
    expect(assetValueAt(a, valuations, '2026-03-31')).toBe(5500);
    expect(assetValueAt(a, valuations, '2026-04-01')).toBe(7000);
  });

  it('未持有时点返回 null', () => {
    const a = asset({ acquiredDateKey: '2026-01-10' });
    expect(assetValueAt(a, [], '2026-01-01')).toBeNull();
  });
});

describe('portfolioTrend', () => {
  const refKey = '2026-06-15';

  it('输出连续月份点，当月取今天为时点', () => {
    const points = portfolioTrend([], [], 3, refKey);
    expect(points.map((p) => p.label)).toEqual(['26/4', '26/5', '26/6']);
    expect(points.every((p) => p.valueCents === 0 && p.costCents === 0)).toBe(true);
    expect(points.every((p) => p.count === 0 && p.avgValueCents === 0 && p.avgCostCents === 0)).toBe(true);
  });

  it('月中加入的资产只从当月开始计入', () => {
    const a = asset({ acquiredDateKey: '2026-05-20', costCents: 8000, currentValueCents: 9000 });
    const points = portfolioTrend([a], [valuation(a.id, 8000, '2026-05-20'), valuation(a.id, 9000, '2026-06-01')], 3, refKey);
    expect(points.map((p) => p.valueCents)).toEqual([0, 8000, 9000]);
    expect(points.map((p) => p.costCents)).toEqual([0, 8000, 8000]);
    expect(points.map((p) => p.count)).toEqual([0, 1, 1]);
    expect(points.map((p) => p.avgValueCents)).toEqual([0, 8000, 9000]);
    expect(points.map((p) => p.avgCostCents)).toEqual([0, 8000, 8000]);
  });

  it('多件资产时平均值为总额除以件数', () => {
    const a = asset({ acquiredDateKey: '2026-01-01', costCents: 1000, currentValueCents: 1000 });
    const b = asset({ acquiredDateKey: '2026-01-05', costCents: 3000, currentValueCents: 3000 });
    const points = portfolioTrend([a, b], [], 1, refKey);
    expect(points[0]!.count).toBe(2);
    expect(points[0]!.avgValueCents).toBe(2000);
    expect(points[0]!.avgCostCents).toBe(2000);
  });

  it('出售后组合不再计入该资产', () => {
    const a = asset({
      acquiredDateKey: '2026-01-05',
      status: 'sold',
      closedDateKey: '2026-05-31',
      costCents: 10000,
      currentValueCents: 0,
      soldCents: 11000,
    });
    const points = portfolioTrend([a], [valuation(a.id, 10000, '2026-01-05')], 3, refKey);
    expect(points.map((p) => p.valueCents)).toEqual([10000, 0, 0]);
    expect(points.map((p) => p.count)).toEqual([1, 0, 0]);
  });

  it('退出日与取得日同天时该资产从未进入组合（边界：closedDateKey=acquiredDateKey）', () => {
    const a = asset({ acquiredDateKey: '2026-05-20', status: 'disposed', closedDateKey: '2026-05-20' });
    const points = portfolioTrend([a], [], 2, '2026-06-15');
    expect(points.map((p) => p.valueCents)).toEqual([0, 0]);
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
    const old = asset({ acquiredDateKey: '2025-01-01', currentValueCents: 100000 });
    const recent = asset({ acquiredDateKey: '2026-06-01', currentValueCents: 100000 });
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

  it('加权平均持有时长按估值加权', () => {
    // 旧资产 530 天、值 100000；新资产 14 天、值 300000 → 加权 ≈ (530*100000+14*300000)/400000 ≈ 143.0
    const old = asset({ acquiredDateKey: '2025-01-01', currentValueCents: 100000 });
    const recent = asset({ acquiredDateKey: '2026-06-01', currentValueCents: 300000 });
    const health = assetHealth([old, recent], refKey);
    expect(health.weightedAvgHoldingDays).toBe(143);
  });

  it('无持有资产时平均持有时长为 0', () => {
    const health = assetHealth([asset({ status: 'sold', closedDateKey: '2025-01-01' })], refKey);
    expect(health.holdingCount).toBe(0);
    expect(health.weightedAvgHoldingDays).toBe(0);
  });
});
