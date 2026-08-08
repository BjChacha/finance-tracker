import { combineDateAndTime, dayjs, formatTime, monthRange, nextRunDate, toDateKey, toMonthKey } from '../date';

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

describe('combineDateAndTime', () => {
  it('组合日期与时间为本地时区毫秒时间戳', () => {
    const ts = combineDateAndTime('2026-07-26', '09:30');
    expect(dayjs(ts).format('YYYY-MM-DD HH:mm')).toBe('2026-07-26 09:30');
  });

  it('时间分量可通过 formatTime 还原', () => {
    const ts = combineDateAndTime('2025-01-31', '23:59');
    expect(formatTime(ts)).toBe('23:59');
  });

  it('日期分量可通过 toDateKey 还原（本地时区固化）', () => {
    const ts = combineDateAndTime('2024-02-29', '00:00');
    expect(toDateKey(ts)).toBe('2024-02-29');
  });

  it('非法日期输入返回 NaN，交由调用方防御', () => {
    expect(Number.isNaN(combineDateAndTime('not-a-date', '09:30'))).toBe(true);
  });

  it('合法 HH:mm（由 DateTimePicker 写入）组合出有限时间戳', () => {
    expect(Number.isFinite(combineDateAndTime('2026-07-26', '00:00'))).toBe(true);
    expect(Number.isFinite(combineDateAndTime('2026-07-26', '23:59'))).toBe(true);
  });
});
