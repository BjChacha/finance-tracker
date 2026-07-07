import { monthRange, nextRunDate, toDateKey, toMonthKey } from '../date';

describe('toDateKey / toMonthKey / monthRange', () => {
  it('formats date key', () => {
    expect(toDateKey(new Date(2026, 6, 7))).toBe('2026-07-07');
  });
  it('extracts month key', () => {
    expect(toMonthKey('2026-07-07')).toBe('2026-07');
  });
  it('computes month range', () => {
    expect(monthRange('2026-02')).toEqual(['2026-02-01', '2026-02-28']);
    expect(monthRange('2024-02')).toEqual(['2024-02-01', '2024-02-29']);
    expect(monthRange('2026-07')).toEqual(['2026-07-01', '2026-07-31']);
  });
});

describe('nextRunDate', () => {
  it('daily advances by interval days', () => {
    expect(nextRunDate('2026-07-07', 'daily', 1, 0)).toBe('2026-07-08');
    expect(nextRunDate('2026-07-30', 'daily', 3, 0)).toBe('2026-08-02');
  });

  it('weekly lands on anchor weekday', () => {
    // 2026-07-07 是周二；anchor=1（周一），下周一 = 2026-07-13
    expect(nextRunDate('2026-07-07', 'weekly', 1, 1)).toBe('2026-07-13');
    // anchor=7（周日）
    expect(nextRunDate('2026-07-07', 'weekly', 1, 7)).toBe('2026-07-12');
  });

  it('monthly end-of-month alignment: anchor=31 clamps to shorter months', () => {
    expect(nextRunDate('2026-01-31', 'monthly', 1, 31)).toBe('2026-02-28');
    expect(nextRunDate('2024-01-31', 'monthly', 1, 31)).toBe('2024-02-29'); // 闰年
    expect(nextRunDate('2026-02-28', 'monthly', 1, 31)).toBe('2026-03-31'); // 回到 31 号
  });

  it('monthly regular anchor', () => {
    expect(nextRunDate('2026-07-15', 'monthly', 1, 15)).toBe('2026-08-15');
    expect(nextRunDate('2026-07-15', 'monthly', 2, 15)).toBe('2026-09-15');
  });

  it('yearly anchor MMDD with Feb-29 fallback', () => {
    expect(nextRunDate('2026-05-01', 'yearly', 1, 501)).toBe('2027-05-01');
    expect(nextRunDate('2024-02-29', 'yearly', 1, 229)).toBe('2025-02-28'); // 平年回退
  });
});
