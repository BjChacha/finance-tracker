import {
  advanceOneStep,
  advanceRule,
  alignToAnchor,
  describeFrequency,
  generateRunDates,
  type RuleSchedule,
} from '../transform';

function rule(partial: Partial<RuleSchedule> & Pick<RuleSchedule, 'nextRunDate'>): RuleSchedule {
  return { frequency: 'monthly', interval: 1, anchor: 1, endDate: null, ...partial };
}

describe('alignToAnchor', () => {
  it('daily starts on startDate', () => {
    expect(alignToAnchor('2026-07-07', 'daily', 1)).toBe('2026-07-07');
  });
  it('weekly aligns to the nearest anchor weekday (same day counts)', () => {
    // 2026-07-07 是周二
    expect(alignToAnchor('2026-07-07', 'weekly', 2)).toBe('2026-07-07'); // 周二当天
    expect(alignToAnchor('2026-07-07', 'weekly', 1)).toBe('2026-07-13'); // 下周一
    expect(alignToAnchor('2026-07-07', 'weekly', 7)).toBe('2026-07-12'); // 周日
  });
  it('monthly picks this month anchor or next month', () => {
    expect(alignToAnchor('2026-07-07', 'monthly', 15)).toBe('2026-07-15');
    expect(alignToAnchor('2026-07-20', 'monthly', 15)).toBe('2026-08-15');
    expect(alignToAnchor('2026-07-07', 'monthly', 7)).toBe('2026-07-07'); // 当天
  });
  it('monthly anchor=31 clamps to month end', () => {
    expect(alignToAnchor('2026-02-10', 'monthly', 31)).toBe('2026-02-28');
    expect(alignToAnchor('2026-04-05', 'monthly', 31)).toBe('2026-04-30');
  });
  it('yearly picks this year MMDD or next year', () => {
    expect(alignToAnchor('2026-03-01', 'yearly', 501)).toBe('2026-05-01');
    expect(alignToAnchor('2026-06-01', 'yearly', 501)).toBe('2027-05-01');
    expect(alignToAnchor('2025-01-01', 'yearly', 229)).toBe('2025-02-28'); // 平年回退
  });
});

describe('generateRunDates', () => {
  it('generates all dates from nextRunDate to today (multi-period catch-up)', () => {
    const r = rule({ nextRunDate: '2026-04-01', frequency: 'monthly', anchor: 1 });
    expect(generateRunDates(r, '2026-07-07')).toEqual([
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
    ]);
  });
  it('month-end alignment 1/31 → 2/28 → 3/31', () => {
    const r = rule({ nextRunDate: '2026-01-31', frequency: 'monthly', anchor: 31 });
    expect(generateRunDates(r, '2026-04-01')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
  it('leap year month-end: 1/31 → 2/29', () => {
    const r = rule({ nextRunDate: '2024-01-31', frequency: 'monthly', anchor: 31 });
    expect(generateRunDates(r, '2024-03-01')).toEqual(['2024-01-31', '2024-02-29']);
  });
  it('truncates at endDate', () => {
    const r = rule({
      nextRunDate: '2026-05-01',
      frequency: 'monthly',
      anchor: 1,
      endDate: '2026-06-15',
    });
    expect(generateRunDates(r, '2026-07-07')).toEqual(['2026-05-01', '2026-06-01']);
  });
  it('returns empty when nextRunDate already beyond endDate', () => {
    const r = rule({ nextRunDate: '2026-07-01', endDate: '2026-06-30' });
    expect(generateRunDates(r, '2026-07-07')).toEqual([]);
  });
  it('respects interval > 1', () => {
    const r = rule({ nextRunDate: '2026-01-05', frequency: 'monthly', interval: 2, anchor: 5 });
    expect(generateRunDates(r, '2026-07-07')).toEqual(['2026-01-05', '2026-03-05', '2026-05-05', '2026-07-05']);
  });
  it('weekly interval 2', () => {
    const r = rule({ nextRunDate: '2026-06-01', frequency: 'weekly', interval: 2, anchor: 1 });
    expect(generateRunDates(r, '2026-07-01')).toEqual(['2026-06-01', '2026-06-15', '2026-06-29']);
  });
  it('returns empty when nextRunDate in the future', () => {
    const r = rule({ nextRunDate: '2026-08-01' });
    expect(generateRunDates(r, '2026-07-07')).toEqual([]);
  });
});

describe('advanceRule', () => {
  it('advances pointer past today', () => {
    const r = rule({ nextRunDate: '2026-04-01', frequency: 'monthly', anchor: 1 });
    expect(advanceRule(r, '2026-07-07')).toEqual({ nextRun: '2026-08-01', expired: false });
  });
  it('marks expired when next run exceeds endDate', () => {
    const r = rule({
      nextRunDate: '2026-05-01',
      frequency: 'monthly',
      anchor: 1,
      endDate: '2026-06-15',
    });
    expect(advanceRule(r, '2026-07-07')).toEqual({ nextRun: '2026-07-01', expired: true });
  });
  it('expired immediately when nextRunDate beyond endDate', () => {
    const r = rule({ nextRunDate: '2026-07-01', endDate: '2026-06-30' });
    expect(advanceRule(r, '2026-07-07')).toEqual({ nextRun: '2026-07-01', expired: true });
  });
  it('keeps future pointer untouched', () => {
    const r = rule({ nextRunDate: '2026-08-01' });
    expect(advanceRule(r, '2026-07-07')).toEqual({ nextRun: '2026-08-01', expired: false });
  });
});

describe('advanceOneStep', () => {
  it('advances a single period', () => {
    const r = rule({ nextRunDate: '2026-07-01', frequency: 'monthly', anchor: 1 });
    expect(advanceOneStep(r)).toEqual({ nextRun: '2026-08-01', expired: false });
  });
  it('flags expiry against endDate', () => {
    const r = rule({ nextRunDate: '2026-07-01', anchor: 1, endDate: '2026-07-15' });
    expect(advanceOneStep(r)).toEqual({ nextRun: '2026-08-01', expired: true });
  });
});

describe('describeFrequency', () => {
  it('renders Chinese descriptions', () => {
    expect(describeFrequency('daily', 1, 0)).toBe('每天');
    expect(describeFrequency('daily', 3, 0)).toBe('每3天');
    expect(describeFrequency('weekly', 1, 1)).toBe('每周一');
    expect(describeFrequency('weekly', 2, 3)).toBe('每2周·周三');
    expect(describeFrequency('monthly', 1, 1)).toBe('每月1日');
    expect(describeFrequency('monthly', 1, 31)).toBe('每月月末');
    expect(describeFrequency('monthly', 3, 10)).toBe('每3个月·10日');
    expect(describeFrequency('yearly', 1, 501)).toBe('每年5月1日');
  });
});
