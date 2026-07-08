import { budgetLevel, budgetPct, crossedTier, dailyAvailable } from '../transform';

describe('budgetPct', () => {
  it('computes percent with one decimal', () => {
    expect(budgetPct(5000, 10000)).toBe(50);
    expect(budgetPct(3333, 10000)).toBe(33.3);
    expect(budgetPct(12345, 10000)).toBe(123.5);
  });
  it('returns 0 for zero amount', () => {
    expect(budgetPct(5000, 0)).toBe(0);
  });
});

describe('budgetLevel', () => {
  it('over when spent >= amount', () => {
    expect(budgetLevel(10000, 10000, 80)).toBe('over');
    expect(budgetLevel(10001, 10000, 80)).toBe('over');
  });
  it('warn when reaching alertPct but not over', () => {
    expect(budgetLevel(8000, 10000, 80)).toBe('warn');
    expect(budgetLevel(9999, 10000, 80)).toBe('warn');
  });
  it('ok below alertPct', () => {
    expect(budgetLevel(7999, 10000, 80)).toBe('ok');
  });
  it('alertPct=100 has no warn tier', () => {
    expect(budgetLevel(9999, 10000, 100)).toBe('ok');
    expect(budgetLevel(10000, 10000, 100)).toBe('over');
  });
});

describe('crossedTier', () => {
  it('returns 100 when overspent (including exactly 100%)', () => {
    expect(crossedTier(10000, 10000, 80)).toBe(100);
    expect(crossedTier(15000, 10000, 80)).toBe(100);
  });
  it('returns alertPct when threshold crossed but not over', () => {
    expect(crossedTier(8000, 10000, 80)).toBe(80);
    expect(crossedTier(9000, 10000, 80)).toBe(80);
  });
  it('returns null below threshold', () => {
    expect(crossedTier(7999, 10000, 80)).toBeNull();
    expect(crossedTier(0, 10000, 80)).toBeNull();
  });
  it('alertPct=100 only fires the overspend tier', () => {
    expect(crossedTier(9999, 10000, 100)).toBeNull();
    expect(crossedTier(10000, 10000, 100)).toBe(100);
  });
  it('integer-cent boundary is exact (no float drift)', () => {
    // 80% of 333 分 = 266.4 → 266 未达、267 达
    expect(crossedTier(266, 333, 80)).toBeNull();
    expect(crossedTier(267, 333, 80)).toBe(80);
  });
  it('zero amount never fires', () => {
    expect(crossedTier(100, 0, 80)).toBeNull();
  });
});

describe('dailyAvailable', () => {
  it('current month divides remaining by days left including today', () => {
    // 2026-07 有 31 天，7 号起剩 25 天
    expect(dailyAvailable(25000, '2026-07', '2026-07-07')).toBe(1000);
    // 月末最后一天剩 1 天
    expect(dailyAvailable(500, '2026-07', '2026-07-31')).toBe(500);
  });
  it('past month returns 0', () => {
    expect(dailyAvailable(10000, '2026-06', '2026-07-07')).toBe(0);
  });
  it('future month divides by full month days', () => {
    expect(dailyAvailable(31000, '2026-08', '2026-07-07')).toBe(1000);
  });
  it('non-positive remaining returns 0', () => {
    expect(dailyAvailable(0, '2026-07', '2026-07-07')).toBe(0);
    expect(dailyAvailable(-100, '2026-07', '2026-07-07')).toBe(0);
  });
  it('rounds down to whole cents', () => {
    expect(dailyAvailable(100, '2026-07', '2026-07-29')).toBe(33); // 100 / 3 天
  });
});
