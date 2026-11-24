import {
  buildWeekdayStats,
  datesInRange,
  WEEKDAY_NAMES,
  weekdayIndex,
  weekdaySummary,
} from '../weekday-model';

describe('datesInRange', () => {
  it('含首尾两个端点', () => {
    expect(datesInRange('2026-11-02', '2026-11-08')).toHaveLength(7);
    expect(datesInRange('2026-11-02', '2026-11-02')).toEqual(['2026-11-02']);
  });

  it('start 晚于 end 时返回空数组（而不是抛错或倒着走）', () => {
    expect(datesInRange('2026-11-08', '2026-11-02')).toEqual([]);
  });

  it('跨月跨年都连续', () => {
    const dates = datesInRange('2025-12-30', '2026-01-02');
    expect(dates).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
  });
});

describe('weekdayIndex', () => {
  it('周一为 0、周日为 6', () => {
    // 用 datesInRange 造出连续 7 天，索引应当恰好覆盖 0..6 各一次
    const indexes = datesInRange('2026-11-02', '2026-11-08')
      .map(weekdayIndex)
      .sort((a, b) => a - b);
    expect(indexes).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('buildWeekdayStats', () => {
  it('每个星期几各出现一次时，天数均为 1', () => {
    const dates = datesInRange('2026-11-02', '2026-11-08');
    const stats = buildWeekdayStats([], dates);
    expect(stats).toHaveLength(7);
    expect(stats.map((item) => item.days)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(stats.map((item) => item.total)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(stats.map((item) => item.name)).toEqual([...WEEKDAY_NAMES]);
  });

  it('金额落到对应的星期几，日均按「该星期几出现的天数」摊（含无支出日）', () => {
    // 连续 14 天 → 每个星期几出现 2 次
    const dates = datesInRange('2026-11-02', '2026-11-15');
    const target = dates[0]!;
    const stats = buildWeekdayStats(
      [{ dateKey: target, total: 700, count: 2 }],
      dates,
    );
    const bucket = stats[weekdayIndex(target)]!;
    expect(bucket.days).toBe(2);
    expect(bucket.total).toBe(700);
    expect(bucket.dailyAvg).toBe(350);
    expect(bucket.count).toBe(2);
    // 其它星期几仍为零，且天数同样是 2
    expect(stats.filter((item) => item.total === 0)).toHaveLength(6);
    expect(stats.every((item) => item.days === 2)).toBe(true);
  });

  it('同一天多行会累加（例如按日聚合后的多币种/多类型）', () => {
    const dates = ['2026-11-02'];
    const stats = buildWeekdayStats(
      [
        { dateKey: '2026-11-02', total: 100, count: 1 },
        { dateKey: '2026-11-02', total: 250, count: 3 },
      ],
      dates,
    );
    const bucket = stats[weekdayIndex('2026-11-02')]!;
    expect(bucket.total).toBe(350);
    expect(bucket.count).toBe(4);
    expect(bucket.dailyAvg).toBe(350);
  });

  it('日期列表为空时全部为 0，日均不出现除零', () => {
    const stats = buildWeekdayStats([{ dateKey: '2026-11-02', total: 500, count: 1 }], []);
    expect(stats.every((item) => item.days === 0)).toBe(true);
    expect(stats.every((item) => item.dailyAvg === 0)).toBe(true);
    // 金额仍然归入对应星期几（只是没有天数可摊）
    expect(stats[weekdayIndex('2026-11-02')]!.total).toBe(500);
  });
});

describe('weekdaySummary', () => {
  const stats = WEEKDAY_NAMES.map((name, weekday) => {
    const weekend = weekday >= 5;
    return {
      weekday,
      name,
      total: weekend ? 300 : 100,
      days: weekend ? 2 : 5,
      dailyAvg: weekend ? 150 : 20,
      count: 1,
    };
  });

  it('工作日/周末分别按各自天数取日均', () => {
    const summary = weekdaySummary(stats);
    expect(summary.weekdayAvg).toBe(20); // 500 / 25
    expect(summary.weekendAvg).toBe(150); // 600 / 4
    expect(summary.total).toBe(1100);
    expect(summary.weekendShare).toBeCloseTo(600 / 1100, 6);
  });

  it('无支出时占比为 null（而不是 0 或 NaN）', () => {
    const empty = stats.map((item) => ({ ...item, total: 0 }));
    expect(weekdaySummary(empty).weekendShare).toBeNull();
    expect(weekdaySummary(empty).total).toBe(0);
  });
});
