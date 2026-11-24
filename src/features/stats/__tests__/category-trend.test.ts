import {
  buildCategoryTrend,
  monthsInRange,
  OTHER_CATEGORY_ID,
  trendMonths,
  trendPeak,
} from '../category-trend-model';

const row = (
  categoryId: string,
  month: string,
  total: number,
  name = categoryId,
  color = '#000000',
) => ({ categoryId, name, color, month, total });

describe('monthsInRange', () => {
  it('含首尾所在月', () => {
    expect(monthsInRange('2026-01-15', '2026-03-02')).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
  });

  it('同月内返回单个月', () => {
    expect(monthsInRange('2026-11-02', '2026-11-30')).toEqual(['2026-11']);
  });

  it('跨年连续', () => {
    expect(monthsInRange('2025-11-10', '2026-01-05')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
    ]);
  });
});

describe('buildCategoryTrend', () => {
  const months = ['2026-01', '2026-02', '2026-03'];

  it('缺失月补 0，values 与 months 等长', () => {
    const trend = buildCategoryTrend([row('food', '2026-01', 100)], months);
    expect(trend.keys).toEqual(months);
    expect(trend.series).toHaveLength(1);
    expect(trend.series[0]!.values).toEqual([100, 0, 0]);
    expect(trend.series[0]!.values).toHaveLength(months.length);
  });

  it('同分类同月多行累加', () => {
    const trend = buildCategoryTrend(
      [row('food', '2026-02', 100), row('food', '2026-02', 250)],
      months,
    );
    expect(trend.series[0]!.values[1]).toBe(350);
  });

  it('按总额降序取前 limit 个，其余合并为「其他」', () => {
    const trend = buildCategoryTrend(
      [
        row('a', '2026-01', 500),
        row('b', '2026-01', 400),
        row('c', '2026-01', 300),
        row('d', '2026-02', 200),
        row('e', '2026-02', 100),
      ],
      months,
      { limit: 2 },
    );
    expect(trend.series.map((item) => item.categoryId)).toEqual([
      'a',
      'b',
      OTHER_CATEGORY_ID,
    ]);
    expect(trend.truncated).toBe(3);
    // 「其他」= c + d + e，逐月累加
    const other = trend.series[2]!;
    expect(other.values[0]).toBe(300); // c 在 1 月
    expect(other.values[1]).toBe(300); // d+e 在 2 月
  });

  it('分类数不超 limit 时不产生「其他」', () => {
    const trend = buildCategoryTrend(
      [row('a', '2026-01', 10), row('b', '2026-01', 20)],
      months,
      { limit: 4 },
    );
    expect(trend.truncated).toBe(0);
    expect(trend.series.some((item) => item.categoryId === OTHER_CATEGORY_ID)).toBe(false);
  });

  it('忽略区间外的月份，避免把噪声算进合计', () => {
    const trend = buildCategoryTrend(
      [row('a', '2026-01', 100), row('a', '2026-09', 9999)],
      months,
    );
    expect(trend.series[0]!.values).toEqual([100, 0, 0]);
  });

  it('空输入返回空序列', () => {
    const trend = buildCategoryTrend([], months);
    expect(trend.series).toEqual([]);
    expect(trend.truncated).toBe(0);
    expect(trend.keys).toEqual(months);
  });

  it('跨年时轴标签带年份，同年时只给月份', () => {
    const cross = buildCategoryTrend([row('a', '2025-12', 1)], ['2025-12', '2026-01']);
    expect(cross.labels[0]).toContain('2025');
    const same = buildCategoryTrend([row('a', '2026-01', 1)], ['2026-01', '2026-02']);
    expect(same.labels[0]).toBe('1');
  });

  it('limit 非法值兜底为至少 1 条序列', () => {
    const trend = buildCategoryTrend(
      [row('a', '2026-01', 10), row('b', '2026-01', 20)],
      months,
      { limit: 0 },
    );
    expect(trend.series).toHaveLength(2); // 1 条 top + 「其他」
    expect(trend.truncated).toBe(1);
  });
});

describe('trendMonths', () => {
  it('月视图（1 个点）向前补足到 6 个月，否则看不出走向', () => {
    expect(trendMonths('2026-11-01', '2026-11-24')).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
  });

  it('季视图（3 个月）同样补足到 6 个月', () => {
    const months = trendMonths('2026-09-01', '2026-11-24');
    expect(months).toHaveLength(6);
    expect(months[0]).toBe('2026-06');
    expect(months[months.length - 1]).toBe('2026-11');
  });

  it('已达到 6 个月的周期不改窗口', () => {
    expect(trendMonths('2026-01-01', '2026-12-31')).toHaveLength(12);
    expect(trendMonths('2026-06-01', '2026-11-30')).toHaveLength(6);
  });

  it('补窗口会跨年', () => {
    expect(trendMonths('2026-02-01', '2026-03-31')).toEqual([
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
  });
});

describe('trendPeak', () => {
  it('取出所有序列的最大单月值', () => {
    const trend = buildCategoryTrend(
      [row('a', '2026-01', 100), row('a', '2026-02', 900), row('b', '2026-01', 500)],
      ['2026-01', '2026-02'],
    );
    expect(trendPeak(trend)).toBe(900);
  });

  it('空数据为 0', () => {
    expect(trendPeak(buildCategoryTrend([], ['2026-01']))).toBe(0);
  });
});
