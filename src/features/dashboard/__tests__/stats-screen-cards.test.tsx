import { fireEvent, render, screen } from '@testing-library/react-native';
import { StatsScreen } from '../stats-screen';
import { WEEKDAY_NAMES } from '@/features/stats/weekday-model';
import { aggregateMoneyFlow, type FlowRow } from '@/features/stats/sankey-model';

/**
 * 统计页接线的冒烟测试。
 *
 * 图表本身的渲染由各自的组件测试覆盖，这里要证明的是**页面把卡片接上了**：
 * 分类明细（趋势/合计/排行三视角）、星期分布、资金流向都出现在同一屏里，
 * 且拿到的数据被真正渲染出来（而不只是挂了个空壳）。
 */

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('react-native-gifted-charts', () => ({
  BarChart: () => null,
  LineChart: () => null,
  PieChart: () => null,
}));

const mockQuery = <T,>(data: T) => ({
  data,
  isPending: false,
  isError: false,
  isFetching: false,
  isPlaceholderData: false,
  fetchStatus: 'idle',
  refetch: jest.fn(),
});

const mockBreakdown = [
  { categoryId: 'food', name: '餐饮', color: '#F97316', total: 8061000, pct: 42.7 },
  { categoryId: 'social', name: '人情', color: '#EC4899', total: 2106000, pct: 11.2 },
];

const mockRank = [
  { categoryId: 'food', name: '餐饮', color: '#F97316', total: 8061000, pct: 42.7 },
  { categoryId: 'social', name: '人情', color: '#EC4899', total: 2106000, pct: 11.2 },
];

const mockWeekday = WEEKDAY_NAMES.map((name, weekday) => ({
  weekday,
  name,
  total: weekday >= 5 ? 600000 : 300000,
  days: weekday >= 5 ? 8 : 17,
  dailyAvg: weekday >= 5 ? 75000 : 17647,
  count: 12,
}));

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

const mockFlow = aggregateMoneyFlow([
  flowRow('cash', '现金', 'food', '餐饮', 500000),
  flowRow('card', '招商银行', 'social', '人情', 300000),
]);

const mockTrend = {
  keys: ['2026-09', '2026-10', '2026-11'],
  labels: ['9', '10', '11'],
  truncated: 2,
  series: [
    { categoryId: 'food', name: '餐饮', color: '#F97316', values: [100, 200, 300] },
    { categoryId: 'social', name: '人情', color: '#EC4899', values: [50, 60, 70] },
  ],
};

jest.mock('@/features/stats/hooks', () => ({
  STATS_STALE_TIME: 60_000,
  STATS_GC_TIME: 1_800_000,
  categoryBreakdownOptions: jest.fn(),
  trendOptions: jest.fn(),
  assetHistoryOptions: jest.fn(),
  assetHistoryStartOptions: jest.fn(),
  useCategoryBreakdown: () => mockQuery(mockBreakdown),
  useTrend: () => mockQuery([]),
  useMonthlyCompare: () => mockQuery([]),
  useTransactionDateRange: () => mockQuery({ start: '2026-01-01', end: '2026-11-24' }),
  useTransactionSummary: () => mockQuery({ income: 0, expense: 0 }),
  useAccountDistribution: () => mockQuery([]),
  useNetWorthTrend: () => mockQuery([]),
  useAssetHistory: () => mockQuery([]),
  useAssetHistoryStart: () => mockQuery(undefined),
  useCalendarHeatmap: () => mockQuery([]),
  useCategoryRank: () => mockQuery(mockRank),
  useWeekdayTotals: () => mockQuery(mockWeekday),
}));
jest.mock('@/features/stats/sankey', () => ({
  useMoneyFlow: () => mockQuery(mockFlow),
}));
jest.mock('@/features/stats/category-trend', () => ({
  useCategoryTrend: () => mockQuery(mockTrend),
}));

it('统计页只有一张分类明细卡，默认趋势视角', () => {
  render(<StatsScreen />);
  // 三视角合并成一张卡，标题只出现一次
  expect(screen.getAllByText('分类明细')).toHaveLength(1);
  expect(screen.getByText('趋势')).toBeTruthy();
  expect(screen.getByText('合计')).toBeTruthy();
  expect(screen.getByText('排行')).toBeTruthy();
  // 旧的独立标题不再出现
  expect(screen.queryByText('分类合计')).toBeNull();
  expect(screen.queryByText('分类排行')).toBeNull();
  expect(screen.queryByText('分类趋势')).toBeNull();
});

it('切到排行视角才展示排行榜数据（分类名 + 占比）', () => {
  render(<StatsScreen />);
  expect(screen.queryByText(/按末级分类统计/)).toBeNull();
  fireEvent.press(screen.getByText('排行'));
  expect(screen.getByText(/按末级分类统计/)).toBeTruthy();
  expect(screen.getAllByText('42.7%').length).toBeGreaterThanOrEqual(1);
});

it('星期分布给出工作日/周末日均与周末占比', () => {
  render(<StatsScreen />);
  expect(screen.getByText(/工作日日均/)).toBeTruthy();
  expect(screen.getByText(/周末日均/)).toBeTruthy();
  // 5×30 万分 vs 2×60 万分 → 周末占 44%
  expect(screen.getByText('周末占比 44%')).toBeTruthy();
});

it('资金流向渲染出账户与分类两侧的节点名', () => {
  render(<StatsScreen />);
  expect(screen.getByText('现金')).toBeTruthy();
  expect(screen.getByText('招商银行')).toBeTruthy();
});
