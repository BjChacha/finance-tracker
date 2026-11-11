import {
  DASHBOARD_SECTION_KEYS,
  DEFAULT_LAYOUT,
  normalizeLayout,
  type DashboardLayout,
} from '../sections';

describe('normalizeLayout', () => {
  it('null/未知形状 → 默认布局', () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout({})).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout('garbage')).toEqual(DEFAULT_LAYOUT);
  });

  it('补上新增模块（保持默认相对顺序），丢弃未知 key', () => {
    const stored = { order: ['highlights', 'categories', 'unknown-key'], hidden: [] };
    const layout = normalizeLayout(stored);
    expect(layout.order).toEqual([
      'highlights',
      'categories',
      'insights',
      'report',
      'assets',
      'pace',
    ]);
  });

  it('hidden 去重', () => {
    const layout = normalizeLayout({
      order: [...DASHBOARD_SECTION_KEYS],
      hidden: ['pace', 'pace', 'bogus'],
    });
    expect(layout.hidden).toEqual(['pace']);
  });

  it('合法自定义布局原样保留', () => {
    const custom: DashboardLayout = {
      order: ['insights', 'pace', 'report', 'assets', 'categories', 'highlights'],
      hidden: [],
    };
    expect(normalizeLayout(custom)).toEqual(custom);
  });
});
