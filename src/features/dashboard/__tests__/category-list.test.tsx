import { fireEvent, render, screen, within } from '@testing-library/react-native';
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

it('labels narrow treemap tiles that used to stay blank', () => {
  const slices = [
    { ...items[0]!, categoryId: 'big', name: 'Rent', total: 750, pct: 75 },
    { ...items[1]!, categoryId: 'small', name: 'Snacks', total: 250, pct: 25 },
  ];
  render(<CategoryList items={slices} onPress={jest.fn()} showComposition />);
  fireEvent(screen.getByTestId('category-treemap'), 'layout', {
    nativeEvent: { layout: { width: 200, height: 132 } },
  });
  // 50px 宽的小色块：旧阈值（w>=54）下完全没有文字
  const treemap = within(screen.getByTestId('category-treemap'));
  expect(treemap.getByText('Snacks')).toBeTruthy();
  expect(treemap.getByText('Rent')).toBeTruthy();
});

it('lists every category from the treemap corner entry', () => {
  const onPress = jest.fn();
  render(<CategoryList items={items} onPress={onPress} showComposition />);
  fireEvent(screen.getByTestId('category-treemap'), 'layout', {
    nativeEvent: { layout: { width: 360, height: 132 } },
  });
  expect(screen.queryByText('Category 6')).toBeNull();
  fireEvent.press(screen.getByLabelText(copy.allCategories));
  fireEvent.press(screen.getByText('Category 6'));
  expect(onPress).toHaveBeenCalledWith(items[6]);
  expect(screen.queryByText(copy.sheetTotal)).toBeNull();
});
