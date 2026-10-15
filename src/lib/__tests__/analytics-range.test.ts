import {
  amountChange,
  isDateKey,
  parsePeriodParams,
  resolvePeriod,
} from '../analytics-range';

describe('analytics periods', () => {
  it('compares month-to-date with the same elapsed days', () => {
    expect(
      resolvePeriod({ period: 'month', key: '2026-10' }, '2026-10-14'),
    ).toMatchObject({
      range: { start: '2026-10-01', end: '2026-10-14' },
      comparison: { start: '2026-09-01', end: '2026-09-14' },
      elapsedDays: 14,
    });
  });
  it('compares completed months and caps incomplete comparisons at the previous month end', () => {
    expect(
      resolvePeriod({ period: 'month', key: '2024-03' }, '2024-03-30')
        .comparison.end,
    ).toBe('2024-02-29');
    expect(
      resolvePeriod({ period: 'month', key: '2026-09' }, '2026-10-14')
        .comparison,
    ).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });
  it('handles cross-year quarters and leap-year progress', () => {
    expect(
      resolvePeriod({ period: 'quarter', key: '2026-Q1' }, '2026-01-02')
        .comparison,
    ).toEqual({ start: '2025-10-01', end: '2025-10-02' });
    expect(
      resolvePeriod({ period: 'year', key: '2024' }, '2024-03-01').comparison
        .end,
    ).toBe('2023-03-02');
  });
  it('does not divide by a zero comparison baseline', () => {
    expect(amountChange(500, 0)).toEqual({ delta: 500, percent: null });
    expect(amountChange(0, 0)).toEqual({ delta: 0, percent: null });
    expect(amountChange(150, 100)).toEqual({ delta: 50, percent: 50 });
  });
  it('rejects impossible dates', () => {
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('2024-02-29')).toBe(true);
  });
  it('normalizes invalid or future route periods to the current month', () => {
    for (const params of [
      { period: 'quarter', key: '2026-Q5' },
      { period: 'month', key: '2026-13' },
      { period: 'year', key: '2027' },
    ]) {
      expect(parsePeriodParams(params, '2026-10-14')).toEqual({
        period: 'month',
        key: '2026-10',
      });
    }
    expect(
      parsePeriodParams({ period: 'quarter', key: '2025-Q4' }, '2026-10-14'),
    ).toEqual({ period: 'quarter', key: '2025-Q4' });
  });
});
