import { act, render, screen } from '@testing-library/react-native';
import { TrendLineChart, type LinePoint } from '../TrendLineChart';

let mockChartProps: Record<string, any>;
jest.mock('react-native-gifted-charts', () => ({
  LineChart: (props: Record<string, any>) => {
    mockChartProps = props;
    return null;
  },
}));

const points: LinePoint[] = [
  { label: '10.01', detailLabel: '2026-10-01', primary: 12345, secondary: 100 },
  { label: '10.02', detailLabel: '2026-10-02', primary: 67890, secondary: 200 },
];

function Chart({ data = points }: { data?: LinePoint[] }) {
  return (
    <TrendLineChart
      points={data}
      primaryLabel="Expense"
      primaryColor="#ff0000"
      secondaryLabel="Income"
      secondaryColor="#00ff00"
    />
  );
}

it('keeps exact source amounts visible after selecting a date and resets for a new period', () => {
  const { rerender } = render(<Chart />);
  expect(screen.getByText('Expense \u00a5678.90')).toBeTruthy();
  act(() => mockChartProps.onFocus({ value: 0 }, 0));
  expect(screen.getByText(/2026-10-01/)).toBeTruthy();
  expect(screen.getByText('Expense \u00a5123.45')).toBeTruthy();
  expect(screen.getByText('Income \u00a51.00')).toBeTruthy();
  rerender(
    <Chart
      data={[{ label: '11.01', detailLabel: '2026-11-01', primary: 0 }]}
    />,
  );
  expect(screen.queryByText(/2026-10-01/)).toBeNull();
  expect(screen.getByText('Expense \u00a50.00')).toBeTruthy();
});

it('fits every bucket of a long history inside the visible plot', () => {
  render(
    <Chart
      data={Array.from({ length: 120 }, (_, index) => ({
        label: String(index),
        primary: index * 100,
      }))}
    />,
  );
  const { spacing, initialSpacing, endSpacing, data, width } = mockChartProps;
  expect(
    initialSpacing + spacing * (data.length - 1) + endSpacing,
  ).toBeLessThanOrEqual(width);
});

it('shows each actual comparison date beside its original amount', () => {
  render(
    <TrendLineChart
      points={[
        {
          label: '2.29',
          detailLabel: '2024-02-29',
          secondaryDetailLabel: '2024-01-31',
          primary: 2901,
          secondary: 3102,
        },
      ]}
      primaryLabel="Current"
      primaryColor="#123456"
      secondaryLabel="Previous"
      secondaryColor="#777777"
      secondaryDashed
      fillPrimary
    />,
  );
  expect(
    screen.getByText(/Current 2024-02-29.*Previous 2024-01-31/),
  ).toBeTruthy();
  expect(screen.getByText('Current \u00a529.01')).toBeTruthy();
  expect(screen.getByText('Previous \u00a531.02')).toBeTruthy();
});

it('smooths through dense samples without dipping below the data range', () => {
  const data = Array.from({ length: 9 }, (_, index) => ({
    label: `L${index}`,
    detailLabel: `2026-01-0${index + 1}`,
    primary: index % 2 === 0 ? 0 : 5000,
  }));
  render(<Chart data={data} />);
  const values: number[] = mockChartProps.data.map(
    (item: { value: number }) => item.value,
  );
  // 每段 6 个采样点，末端补一个真实点
  expect(values).toHaveLength((data.length - 1) * 6 + 1);
  expect(Math.min(...values)).toBe(0);
  expect(Math.max(...values)).toBe(50);
  // 原始点仍在采样网格上，标签也只挂在原始点
  expect(values[6]).toBe(50);
  expect(values[12]).toBe(0);
  expect(
    mockChartProps.data.filter((item: { labelComponent?: unknown }) =>
      Boolean(item.labelComponent),
    ),
  ).toHaveLength(6);
});

it('snaps a smoothed focus back to the owning bucket', () => {
  const data = Array.from({ length: 9 }, (_, index) => ({
    label: `L${index}`,
    detailLabel: `2026-01-0${index + 1}`,
    primary: (index + 1) * 100,
  }));
  render(<Chart data={data} />);
  // 第 2 个原始点 = 采样点 12，点 13 采到的是同一条数据
  act(() => mockChartProps.onFocus({ value: 0 }, 13));
  expect(screen.getByText(/2026-01-03/)).toBeTruthy();
  expect(screen.getByText('Expense \u00a53.00')).toBeTruthy();
  expect(mockChartProps.focusedDataPointIndex).toBe(12);
});
