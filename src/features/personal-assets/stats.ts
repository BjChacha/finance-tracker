import type { AssetValuation, AssetStatus, PersonalAsset } from '@/db/schema';
import { dayjs, todayKey } from '@/lib/date';
import { resolveAssetCategory } from './meta';

/**
 * 个人资产统计（纯函数，供看板与测试使用）。
 * 口径约定：
 * - 市值/成本/估值一律为本位币分；
 * - 「持有」= status === 'holding'；
 * - 浮动盈亏 = 持有市值 - 持有成本；
 * - 已实现收益 = Σ(出售所得 - 成本)，处置资产所得记 0（即 -成本 全损）。
 */

export type AssetStats = {
  counts: { all: number; holding: number; sold: number; disposed: number };
  /** 持有资产当前估值合计 */
  holdingMarketValueCents: number;
  /** 持有资产成本合计 */
  holdingCostCents: number;
  /** 浮动盈亏 = holdingMarketValueCents - holdingCostCents */
  unrealizedGainCents: number;
  /** 已实现收益（出售净利润 + 处置全损） */
  realizedGainCents: number;
  /** 出售所得合计 */
  soldProceedsCents: number;
};

export function countByStatus(assets: PersonalAsset[]): Record<AssetStatus, number> {
  const counts = { holding: 0, sold: 0, disposed: 0 };
  for (const a of assets) counts[a.status] += 1;
  return counts;
}

export function computeAssetStats(assets: PersonalAsset[]): AssetStats {
  const counts = countByStatus(assets);
  let holdingMarketValueCents = 0;
  let holdingCostCents = 0;
  let realizedGainCents = 0;
  let soldProceedsCents = 0;
  for (const a of assets) {
    if (a.status === 'holding') {
      holdingMarketValueCents += a.currentValueCents;
      holdingCostCents += a.costCents;
    } else {
      realizedGainCents += (a.status === 'sold' ? a.soldCents ?? 0 : 0) - a.costCents;
      if (a.status === 'sold') soldProceedsCents += a.soldCents ?? 0;
    }
  }
  return {
    counts: { all: assets.length, ...counts },
    holdingMarketValueCents,
    holdingCostCents,
    unrealizedGainCents: holdingMarketValueCents - holdingCostCents,
    realizedGainCents,
    soldProceedsCents,
  };
}

export type CategorySlice = { id: string; label: string; value: number; color: string };

/** 持有资产按类别的市值分布，降序；value 为 0 的类别不返回 */
export function categoryBreakdown(assets: PersonalAsset[]): CategorySlice[] {
  const totals = new Map<string, number>();
  for (const a of assets) {
    if (a.status !== 'holding' || a.currentValueCents <= 0) continue;
    totals.set(a.category, (totals.get(a.category) ?? 0) + a.currentValueCents);
  }
  return [...totals.entries()]
    .map(([key, value]) => {
      const def = resolveAssetCategory(key);
      return { id: key, label: def.label, value, color: def.color };
    })
    .sort((x, y) => y.value - x.value);
}

export type TopAssetItem = {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** 估值（分） */
  total: number;
  /** 占持有市值百分比（保留 1 位小数） */
  pct: number;
};

/** 持有资产估值 Top N */
export function topAssets(assets: PersonalAsset[], limit = 5): TopAssetItem[] {
  const holding = assets.filter((a) => a.status === 'holding');
  const total = holding.reduce((sum, a) => sum + a.currentValueCents, 0);
  return holding
    .slice()
    .sort((x, y) => y.currentValueCents - x.currentValueCents)
    .slice(0, limit)
    .map((a) => ({
      id: a.id,
      name: a.name,
      icon: a.icon,
      color: a.color,
      total: a.currentValueCents,
      pct: total > 0 ? Math.round((a.currentValueCents / total) * 1000) / 10 : 0,
    }));
}

/** 资产在 dateKey 时点是否仍归持有（已取得且未在更早时点出售/处置） */
export function ownedAt(asset: PersonalAsset, dateKey: string): boolean {
  if (asset.acquiredDateKey > dateKey) return false;
  if (asset.status !== 'holding' && asset.closedDateKey && asset.closedDateKey <= dateKey) {
    return false;
  }
  return true;
}

/**
 * 资产在 dateKey 时点的估值：
 * - 未持有（未取得或已退出）→ null
 * - 有 ≤ dateKey 的估值记录 → 取最近一条（同日多条取后建的）
 * - 否则 → 取得成本
 */
export function assetValueAt(
  asset: PersonalAsset,
  valuations: AssetValuation[],
  dateKey: string,
): number | null {
  if (!ownedAt(asset, dateKey)) return null;
  let best: AssetValuation | null = null;
  for (const v of valuations) {
    if (v.assetId !== asset.id || v.dateKey > dateKey) continue;
    if (!best || v.dateKey > best.dateKey || (v.dateKey === best.dateKey && v.createdAt >= best.createdAt)) {
      best = v;
    }
  }
  return best ? best.valueCents : asset.costCents;
}

export type PortfolioPoint = {
  /** 'YY/M' */
  label: string;
  /** 月末组合市值（分） */
  valueCents: number;
  /** 月末持有资产的成本基线（分） */
  costCents: number;
  /** 月末持有件数 */
  count: number;
  /** 单件平均估值（分）；count=0 时为 0 */
  avgValueCents: number;
  /** 单件平均成本（分）；count=0 时为 0 */
  avgCostCents: number;
};

/**
 * 近 N 个月（含当月）各时点的组合市值、成本基线、持有件数与单件均值：
 * - 当月取今天为时点，往月取月末；
 * - 市值按 assetValueAt 汇总（估值优先，回落成本）；
 * - 成本基线 = 当时仍持有资产的取得成本合计（不含已退出资产）；
 * - 单件均值 = 组合总额 / 持有件数（件数为 0 时记 0）。
 */
export function portfolioTrend(
  assets: PersonalAsset[],
  valuations: AssetValuation[],
  months = 12,
  refKey = todayKey(),
): PortfolioPoint[] {
  const count = Math.max(1, Math.min(60, Math.trunc(months) || 1));
  const ref = dayjs(refKey);
  const points: PortfolioPoint[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const monthEnd = ref.subtract(i, 'month').endOf('month');
    const asOf = i === 0 ? dayjs(refKey) : monthEnd;
    const dateKey = asOf.format('YYYY-MM-DD');
    let valueCents = 0;
    let costCents = 0;
    let heldCount = 0;
    for (const asset of assets) {
      if (!ownedAt(asset, dateKey)) continue;
      const value = assetValueAt(asset, valuations, dateKey);
      if (value !== null) valueCents += value;
      costCents += asset.costCents;
      heldCount += 1;
    }
    points.push({
      label: asOf.format('YY/M'),
      valueCents,
      costCents,
      count: heldCount,
      avgValueCents: heldCount > 0 ? Math.round(valueCents / heldCount) : 0,
      avgCostCents: heldCount > 0 ? Math.round(costCents / heldCount) : 0,
    });
  }
  return points;
}

export type RealizedGainPoint = {
  /** 'YY/M' */
  label: string;
  /** 截至该时点的累计已实现收益（分；出售净收益 + 处置全损） */
  realizedGainCents: number;
};

/**
 * 近 N 个月各时点的累计已实现收益：
 * 只统计 closedDateKey ≤ 当月末的已出售/已处置资产
 * （出售按 soldCents − costCents，处置按 0 − costCents）。
 */
export function realizedGainTrend(
  assets: PersonalAsset[],
  months = 12,
  refKey = todayKey(),
): RealizedGainPoint[] {
  const count = Math.max(1, Math.min(60, Math.trunc(months) || 1));
  const ref = dayjs(refKey);
  const points: RealizedGainPoint[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const monthEnd = ref.subtract(i, 'month').endOf('month');
    const asOf = i === 0 ? dayjs(refKey) : monthEnd;
    const dateKey = asOf.format('YYYY-MM-DD');
    let realizedGainCents = 0;
    for (const asset of assets) {
      if (asset.status === 'holding') continue;
      if (!asset.closedDateKey || asset.closedDateKey > dateKey) continue;
      realizedGainCents += (asset.status === 'sold' ? (asset.soldCents ?? 0) : 0) - asset.costCents;
    }
    points.push({ label: asOf.format('YY/M'), realizedGainCents });
  }
  return points;
}

export type AssetHealth = {
  /** 当前持有件数 */
  holdingCount: number;
  /** 按估值加权的平均持有天数（无持有资产时为 0） */
  weightedAvgHoldingDays: number;
  /** 近 12 个月新增（取得）件数 */
  addedLastYear: number;
  /** 近 12 个月退出（出售/处置）件数 */
  exitedLastYear: number;
};

/** 资产体检指标（纯函数） */
export function assetHealth(assets: PersonalAsset[], refKey = todayKey()): AssetHealth {
  const today = dayjs(refKey);
  const yearAgoKey = today.subtract(365, 'day').format('YYYY-MM-DD');
  let holdingCount = 0;
  let weightedDays = 0;
  let weightSum = 0;
  let addedLastYear = 0;
  let exitedLastYear = 0;
  for (const asset of assets) {
    if (asset.acquiredDateKey >= yearAgoKey) addedLastYear += 1;
    if (asset.status !== 'holding' && asset.closedDateKey && asset.closedDateKey >= yearAgoKey) {
      exitedLastYear += 1;
    }
    if (asset.status !== 'holding') continue;
    holdingCount += 1;
    const days = Math.max(0, today.diff(dayjs(asset.acquiredDateKey), 'day'));
    const weight = Math.max(1, asset.currentValueCents);
    weightedDays += days * weight;
    weightSum += weight;
  }
  return {
    holdingCount,
    weightedAvgHoldingDays: weightSum > 0 ? Math.round(weightedDays / weightSum) : 0,
    addedLastYear,
    exitedLastYear,
  };
}
