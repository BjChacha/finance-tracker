import { render, screen } from '@testing-library/react-native';
import { WeekdayBars } from '../WeekdayBars';
import { WEEKDAY_NAMES } from '../../weekday-model';
import { zh } from '@/i18n/zh';

jest.mock('react-native-gifted-charts', () => ({ BarChart: () => null }));

const withValues = (values: number[]) =>
  WEEKDAY_NAMES.map((name, index) => ({ label: name, value: values[index] ?? 0 }));

it('有数据时渲染七根柱对应的数据（不崩溃、不留空）', () => {
  const { toJSON } = render(
    <WeekdayBars data={withValues([1000, 2000, 1500, 3000, 2500, 8000, 6000])} />,
  );
  expect(toJSON()).toBeTruthy();
});

it('全为零时展示空态而不是空坐标系', () => {
  render(<WeekdayBars data={withValues([0, 0, 0, 0, 0, 0, 0])} />);
  expect(screen.getByText(zh.common.empty)).toBeTruthy();
});

it('空数组同样走空态', () => {
  render(<WeekdayBars data={[]} />);
  expect(screen.getByText(zh.common.empty)).toBeTruthy();
});
