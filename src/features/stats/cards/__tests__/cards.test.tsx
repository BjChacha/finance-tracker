import { fireEvent, render, screen } from '@testing-library/react-native';
import { SpendingFlowCard } from '../SpendingFlowCard';
import { CategoryDetailCard } from '../CategoryDetailCard';
import { aggregateMoneyFlow, type FlowRow } from '../../sankey-model';
import type { CategoryTrend } from '../../category-trend-model';

const flowRow = (
  accountId: string,
  accountName: string,
  categoryId: string,
  categoryName: string,
  total: number,
): FlowRow => ({
  accountId,
  accountName,
  accountColor: '#111111',
  categoryId,
  categoryName,
  categoryColor: '#222222',
  total,
});

// jest 的 mock factory 只能引用名字以 mock 开头的外部变量
const mockFlow = aggregateMoneyFlow([
  flowRow('cash', '现金', 'food', '餐饮', 30000),
  flowRow('card', '招商银行', 'traffic', '交通', 12000),
]);

const mockTrend: CategoryTrend = {
  keys: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'],
  labels: ['6', '7', '8', '9', '10', '11'],
  truncated: 2,
  series: [
    { categoryId: 'food', name: '餐饮', color: '#F97316', values: [1, 2, 3, 4, 5, 6] },
    { categoryId: 'traffic', name: '交通', color: '#0EA5E9', values: [6, 5, 4, 3, 2, 1] },
  ],
};

const mockBreakdown = [
  { categoryId: 'food', name: '餐饮', icon: 'utensils', color: '#F97316', total: 8061000, pct: 42.7 },
  { categoryId: 'social', name: '人情', icon: 'users', color: '#EC4899', total: 2106000, pct: 11.2 },
];

const mockRank = [
  { categoryId: 'food', name: '餐饮', icon: 'utensils', color: '#F97316', total: 8061000, pct: 42.7 },
  { categoryId: 'social', name: '人情', icon: 'users', color: '#EC4899', total: 2106000, pct: 11.2 },
];

const mockTrendCalls: boolean[] = [];
const mockRankCalls: boolean[] = [];

const mockQuery = <T,>(data: T) => ({
  data,
  isPending: false,
  isError: false,
  fetchStatus: 'idle',
  refetch: jest.fn(),
});

jest.mock('../../sankey', () => ({
  useMoneyFlow: () => mockQuery(mockFlow),
}));
jest.mock('../../category-trend', () => ({
  useCategoryTrend: (
    _range: unknown,
    _type: unknown,
    _limit: unknown,
    enabled?: boolean,
  ) => {
    mockTrendCalls.push(enabled ?? true);
    return mockQuery(mockTrend);
  },
}));
jest.mock('../../hooks', () => ({
  useCategoryBreakdown: () => mockQuery(mockBreakdown),
  useCategoryRank: (_range: unknown, _type: unknown, _limit: unknown, enabled?: boolean) => {
    mockRankCalls.push(enabled ?? true);
    return mockQuery(mockRank);
  },
}));

const RANGE = { start: '2026-11-01', end: '2026-11-24' };

const detailProps = {
  range: RANGE,
  type: 'expense' as const,
  comparison: { start: '2026-10-01', end: '2026-10-24' },
  comparisonClamped: true,
  onOpenCategory: jest.fn(),
};

it('资金流向卡片渲染标题、切换与图表', () => {
  render(<SpendingFlowCard range={RANGE} />);
  expect(screen.getByText('资金流向')).toBeTruthy();
  expect(screen.getByText('支出')).toBeTruthy();
  expect(screen.getByText('收入')).toBeTruthy();
  expect(screen.getByText(/宽度表示金额/)).toBeTruthy();
  expect(screen.getByText('现金')).toBeTruthy();
  expect(screen.getByText('餐饮')).toBeTruthy();
});

it('分类明细默认落在「趋势」视角，并写出实际窗口', () => {
  render(<CategoryDetailCard {...detailProps} />);
  expect(screen.getByText('分类明细')).toBeTruthy();
  expect(screen.getByText('趋势')).toBeTruthy();
  expect(screen.getByText('合计')).toBeTruthy();
  expect(screen.getByText('排行')).toBeTruthy();
  expect(
    screen.getByText('2026-06 — 2026-11 · 按一级分类归并 · 缺失月补零 · 另有 2 个分类并入「其他」'),
  ).toBeTruthy();
  // 趋势图例
  expect(screen.getAllByText('交通').length).toBeGreaterThanOrEqual(1);
});

it('切到「合计」显示上一期口径与可下钻的分类列表', () => {
  const onOpenCategory = jest.fn();
  render(<CategoryDetailCard {...detailProps} onOpenCategory={onOpenCategory} />);
  fireEvent.press(screen.getByText('合计'));
  expect(screen.getByText('对比 2026-10-01 — 2026-10-24（同期）')).toBeTruthy();
  fireEvent.press(screen.getAllByText('餐饮')[0]!);
  expect(onOpenCategory).toHaveBeenCalledWith('food');
});

it('切到「排行」显示口径提示与占比', () => {
  render(<CategoryDetailCard {...detailProps} />);
  fireEvent.press(screen.getByText('排行'));
  expect(screen.getByText(/按末级分类统计/)).toBeTruthy();
  expect(screen.getAllByText('42.7%').length).toBeGreaterThanOrEqual(1);
});

it('只查询当前视角：非当前视角的查询保持关闭', () => {
  mockTrendCalls.length = 0;
  mockRankCalls.length = 0;
  render(<CategoryDetailCard {...detailProps} />);
  // 默认趋势：趋势查询开启、排行查询关闭
  expect(mockTrendCalls).toContain(true);
  expect(mockRankCalls.length).toBeGreaterThan(0);
  expect(mockRankCalls.every((enabled) => enabled === false)).toBe(true);
});

it('「全部时间」没有上一期时，合计视角说明降级为全部历史', () => {
  render(<CategoryDetailCard {...detailProps} comparison={null} comparisonClamped={false} />);
  fireEvent.press(screen.getByText('合计'));
  // 行内仍会有各自的「对比」，这里只关心卡片头部不再声称有上一期
  expect(screen.queryByText('对比 2026-10-01 — 2026-10-24（同期）')).toBeNull();
  expect(screen.getByText('全部历史')).toBeTruthy();
});
