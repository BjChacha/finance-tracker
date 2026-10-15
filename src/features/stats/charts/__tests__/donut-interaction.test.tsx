import { fireEvent, render, screen } from '@testing-library/react-native';
import { DonutChart } from '../DonutChart';
import { dashboardText as copy } from '@/features/dashboard/labels';
import { zh } from '@/i18n/zh';

jest.mock('react-native-gifted-charts', () => ({ PieChart: () => null }));

const data = Array.from({ length: 11 }, (_, index) => ({
  id: `category-${index}`,
  label: `Category ${index}`,
  value: 1100 - index * 100,
  color: '#123456',
  pct: 0,
}));

it('opens a selected category and expands Other into real drilldown identities', () => {
  const onDetails = jest.fn();
  render(
    <DonutChart data={data} centerLabel="Expense" onDetails={onDetails} />,
  );
  fireEvent.press(screen.getByText('Category 0'));
  fireEvent.press(screen.getByText(`Category 0 · ${copy.details}`));
  expect(onDetails).toHaveBeenLastCalledWith('category-0');
  fireEvent.press(screen.getByText(zh.stats.other));
  fireEvent.press(screen.getByText('Category 10'));
  expect(onDetails).toHaveBeenLastCalledWith('category-10');
  expect(onDetails).not.toHaveBeenCalledWith('__other__');
});

it('clears selection when the period changes', () => {
  const { rerender } = render(
    <DonutChart data={data} centerLabel="Expense" onDetails={jest.fn()} />,
  );
  fireEvent.press(screen.getByText('Category 0'));
  expect(screen.getByText(`Category 0 · ${copy.details}`)).toBeTruthy();
  rerender(
    <DonutChart
      data={data.map((item) => ({ ...item, value: item.value * 2 }))}
      centerLabel="Expense"
      onDetails={jest.fn()}
    />,
  );
  expect(screen.queryByText(`Category 0 · ${copy.details}`)).toBeNull();
});
