import { render, screen } from '@testing-library/react-native';
import { AssetsScreen } from '../assets-screen';

/**
 * 资产页接线冒烟测试：证明新增的「账户构成」环形图与「近 12 个月净值」折线
 * 确实被页面渲染，而不只是写在了 JSX 里。
 */

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

// 图表库内部用 setTimeout 驱动动画，会在 jest 环境拆除后触发 Animated.timing 崩溃
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

const mockMix = [
  { id: 'cash', name: '现金', color: '#F59E0B', total: 200000, pct: 20 },
  { id: 'cmb', name: '招商银行', color: '#3B82F6', total: 800000, pct: 80 },
];

const mockNetWorth = [
  { month: '2025-12', value: 100000 },
  { month: '2026-06', value: 150000 },
  { month: '2026-11', value: 1234500 },
];

/** AssetCard 需要完整的资产历史结构，缺字段会在渲染时炸掉 */
const mockAssetHistory = {
  opening: { netWorth: 0, assets: 0, liabilities: 0 },
  closing: { netWorth: 1234500, assets: 1234500, liabilities: 0 },
  points: [],
  accounts: [],
};

jest.mock('@/features/stats/hooks', () => ({
  STATS_STALE_TIME: 60_000,
  STATS_GC_TIME: 1_800_000,
  categoryBreakdownOptions: jest.fn(),
  trendOptions: jest.fn(),
  assetHistoryOptions: jest.fn(),
  assetHistoryStartOptions: jest.fn(),
  useCategoryBreakdown: () => mockQuery([]),
  useTrend: () => mockQuery([]),
  useMonthlyCompare: () => mockQuery([]),
  useTransactionDateRange: () => mockQuery({ start: '2026-01-01', end: '2026-11-24' }),
  useTransactionSummary: () => mockQuery({ income: 0, expense: 0 }),
  useAccountDistribution: () => mockQuery(mockMix),
  useNetWorthTrend: () => mockQuery(mockNetWorth),
  useAssetHistory: () => mockQuery(mockAssetHistory),
  useAssetHistoryStart: () => mockQuery(undefined),
  useCalendarHeatmap: () => mockQuery([]),
  useCategoryRank: () => mockQuery([]),
  useWeekdayTotals: () => mockQuery([]),
}));

it('资产页渲染账户构成卡片，并把总额交给环形图', () => {
  render(<AssetsScreen />);
  expect(screen.getByText('账户构成')).toBeTruthy();
  // 环形图整体的无障碍标签带中心文案与合计（100 万分 = ¥10,000.00）
  expect(screen.getByLabelText(/资产 ¥10,000\.00/)).toBeTruthy();
});

it('资产页渲染近 12 个月净值卡片', () => {
  render(<AssetsScreen />);
  expect(screen.getByText('近 12 个月净值')).toBeTruthy();
});
