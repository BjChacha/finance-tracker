import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { useAssetHistoryStart } from '@/features/stats/hooks';
import { usePeriod } from '../use-period';

jest.mock('@/lib/use-today-key', () => ({ useTodayKey: () => '2026-03-15' }));

jest.mock('@/features/stats/hooks', () => ({
  useAssetHistoryStart: jest.fn(),
}));

function Harness() {
  const period = usePeriod(undefined, { withAll: true });
  return (
    <>
      <Text testID="all">{String(period.all)}</Text>
      <Text testID="range">
        {period.range.start}~{period.range.end}
      </Text>
      <Text testID="comparison">
        {period.comparison
          ? `${period.comparison.start}~${period.comparison.end}`
          : 'null'}
      </Text>
      <Text testID="granularity">{period.granularity}</Text>
      <Pressable testID="all-mode" onPress={() => period.setAll(true)} />
      <Pressable testID="month-mode" onPress={() => period.setPeriod('month')} />
    </>
  );
}

function mockStart(data: string | undefined) {
  jest.mocked(useAssetHistoryStart).mockReturnValue({
    data,
    isPending: data === undefined,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useAssetHistoryStart>);
}

it('compares against the previous period by default', () => {
  mockStart(undefined);
  render(<Harness />);
  expect(screen.getByText('false')).toBeTruthy();
  expect(screen.getByText('2026-03-01~2026-03-15')).toBeTruthy();
  expect(screen.getByText('2026-02-01~2026-02-15')).toBeTruthy();
  expect(screen.getByText('day')).toBeTruthy();
  // 未进入「全部」时不查询历史起点，避免每次进看板都多一次聚合
  expect(useAssetHistoryStart).toHaveBeenCalledWith(false);
});

it('drops the comparison and buckets by month in all-time mode', () => {
  mockStart('2025-04-02');
  render(<Harness />);
  act(() => fireEvent.press(screen.getByTestId('all-mode')));
  expect(screen.getByText('true')).toBeTruthy();
  expect(screen.getByText('2025-04-02~2026-03-15')).toBeTruthy();
  expect(screen.getByText('null')).toBeTruthy();
  expect(screen.getByText('month')).toBeTruthy();
  expect(useAssetHistoryStart).toHaveBeenLastCalledWith(true);
});

it('leaves all-time mode as soon as a concrete period is picked', () => {
  mockStart('2025-04-02');
  render(<Harness />);
  act(() => fireEvent.press(screen.getByTestId('all-mode')));
  act(() => fireEvent.press(screen.getByTestId('month-mode')));
  expect(screen.getByText('false')).toBeTruthy();
  expect(screen.getByText('2026-03-01~2026-03-15')).toBeTruthy();
  expect(screen.getByText('2026-02-01~2026-02-15')).toBeTruthy();
});
