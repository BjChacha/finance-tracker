import { trendColor } from '../trend';

const colors = {
  income: '#10B981',
  expense: '#EF4444',
  textSecondary: '#9CA3AF',
};

describe('trendColor', () => {
  it('支出语境：上升=红（坏消息），下降=绿（好消息）', () => {
    expect(trendColor(1200, false, colors)).toBe(colors.expense);
    expect(trendColor(-1200, false, colors)).toBe(colors.income);
  });

  it('收入/净资产语境：上升=绿，下降=红', () => {
    expect(trendColor(1200, true, colors)).toBe(colors.income);
    expect(trendColor(-1200, true, colors)).toBe(colors.expense);
  });

  it('持平为中性灰', () => {
    expect(trendColor(0, true, colors)).toBe(colors.textSecondary);
    expect(trendColor(0, false, colors)).toBe(colors.textSecondary);
  });
});
