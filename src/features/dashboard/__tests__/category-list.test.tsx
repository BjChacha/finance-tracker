import { fireEvent, render, screen } from '@testing-library/react-native';
import { CategoryList } from '../category-list';
import { dashboardText as copy } from '../labels';

const items = Array.from({ length: 7 }, (_, index) => ({
  categoryId: `category-${index}`,
  name: `Category ${index}`,
  icon: 'package',
  color: '#123456',
  total: 700 - index * 100,
  pct: 10,
}));

it('expands every category and passes the original identity into the drilldown', () => {
  const onPress = jest.fn();
  render(<CategoryList items={items} onPress={onPress} />);
  expect(screen.queryByText('Category 6')).toBeNull();
  fireEvent.press(screen.getByText(copy.showAll));
  fireEvent.press(screen.getByText('Category 6'));
  expect(onPress).toHaveBeenCalledWith(items[6]);
  fireEvent.press(screen.getByText(copy.showLess));
  expect(screen.queryByText('Category 6')).toBeNull();
});

it('opens real categories from the treemap and expands the remainder without querying a synthetic ID', () => {
  const onPress = jest.fn();
  const equalItems = items
    .slice(0, 6)
    .map((item) => ({ ...item, total: 100, pct: 16.7 }));
  render(<CategoryList items={equalItems} onPress={onPress} showComposition />);
  fireEvent(screen.getByTestId('category-treemap'), 'layout', {
    nativeEvent: { layout: { width: 360, height: 132 } },
  });
  fireEvent.press(screen.getByLabelText(/^Category 0 .*16.7%$/));
  expect(onPress).toHaveBeenCalledWith(equalItems[0]);
  onPress.mockClear();
  fireEvent.press(
    screen.getByLabelText(new RegExp(`^${copy.otherCategories} `)),
  );
  expect(onPress).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Category 5'));
  expect(onPress).toHaveBeenCalledWith(equalItems[5]);
});
