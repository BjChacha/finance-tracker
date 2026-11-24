import { dayjs } from '@/lib/date';
import { axisLabel, bucketKeys } from './transform';

/**
 * 分类趋势（多序列）的纯数据模型。
 *
 * 单独成文件是为了让单测不必加载数据库：jest 环境里 expo-sqlite 不可用，
 * 而查询层（category-trend.ts）必须 import db。
 */

export type TrendRow = {
  categoryId: string;
  name: string;
  color: string;
  /** 'YYYY-MM' */
  month: string;
  /** 本位币分 */
  total: number;
};

export type TrendSeries = {
  categoryId: string;
  name: string;
  color: string;
  /** 与 keys 等长，缺失月补 0 */
  values: number[];
};

export type CategoryTrend = {
  /** 'YYYY-MM' */
  keys: string[];
  /** X 轴标签（跨年时带年份） */
  labels: string[];
  series: TrendSeries[];
  /** 被合并进「其他」的分类个数 */
  truncated: number;
};

export const OTHER_CATEGORY_ID = '__other__';
export const OTHER_CATEGORY_NAME = '其他';
/** 与分类兜底色一致（repository 里未分类用的灰） */
const OTHER_CATEGORY_COLOR = '#9CA3AF';

/** range 覆盖的月份（含首尾月）；复用 transform 的分桶逻辑保证与其它图表同口径 */
export function monthsInRange(start: string, end: string): string[] {
  return bucketKeys(start, end, 'month');
}

/** 趋势至少铺开的月数 */
export const MIN_TREND_MONTHS = 6;

/**
 * 趋势窗口：不足 {@link MIN_TREND_MONTHS} 个月的周期（月视图只有 1 个点、
 * 季视图 3 个点）看不到走向，这里把窗口向前补足。
 *
 * 补窗口而不是补零：补出来的月份是真实历史数据，零点只会把曲线压成一条平线。
 * 卡片必须把实际窗口写出来，否则「选的是 11 月却画了 6 个月」会让人困惑。
 */
export function trendMonths(start: string, end: string, min = MIN_TREND_MONTHS): string[] {
  const months = monthsInRange(start, end);
  if (months.length === 0 || months.length >= min) return months;
  const first = dayjs(`${months[0]}-01`).subtract(min - months.length, 'month');
  return monthsInRange(first.format('YYYY-MM-DD'), end);
}

/**
 * 纯函数：rows（分类×月 的金额）→ 多序列趋势。
 *
 * 只保留总额最大的 limit 个分类，其余合并成一条「其他」——
 * 手机上超过四五条线就互相遮挡，且小分类的噪声会压过趋势本身。
 */
export function buildCategoryTrend(
  rows: readonly TrendRow[],
  months: readonly string[],
  opts?: { limit?: number },
): CategoryTrend {
  const limit = Math.max(1, opts?.limit ?? 4);
  const at = new Map(months.map((month, index) => [month, index]));
  const byCategory = new Map<
    string,
    { name: string; color: string; total: number; values: number[] }
  >();

  for (const row of rows) {
    const index = at.get(row.month);
    // 区间外的月份（例如查询与月份列表口径不一致）直接丢弃，避免把 0 混进合计
    if (index === undefined) continue;
    let entry = byCategory.get(row.categoryId);
    if (!entry) {
      entry = {
        name: row.name,
        color: row.color,
        total: 0,
        values: new Array<number>(months.length).fill(0),
      };
      byCategory.set(row.categoryId, entry);
    }
    entry.total += row.total;
    entry.values[index] += row.total;
  }

  const ranked = [...byCategory.entries()].sort((a, b) => b[1].total - a[1].total);
  const series: TrendSeries[] = ranked.slice(0, limit).map(([categoryId, entry]) => ({
    categoryId,
    name: entry.name,
    color: entry.color,
    values: entry.values,
  }));

  const rest = ranked.slice(limit);
  if (rest.length > 0) {
    const values = new Array<number>(months.length).fill(0);
    for (const [, entry] of rest) {
      for (let i = 0; i < values.length; i += 1) values[i] += entry.values[i]!;
    }
    series.push({
      categoryId: OTHER_CATEGORY_ID,
      name: OTHER_CATEGORY_NAME,
      color: OTHER_CATEGORY_COLOR,
      values,
    });
  }

  const crossYear =
    months.length > 1 && months[0]!.slice(0, 4) !== months[months.length - 1]!.slice(0, 4);

  return {
    keys: [...months],
    labels: months.map((month) => axisLabel(month, 'month', crossYear)),
    series,
    truncated: rest.length,
  };
}

/** 趋势里所有序列的最大单月值（分），用于卡片上的峰值提示 */
export function trendPeak(trend: CategoryTrend): number {
  let peak = 0;
  for (const series of trend.series) {
    for (const value of series.values) if (value > peak) peak = value;
  }
  return peak;
}
