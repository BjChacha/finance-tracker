import { cumulativeComparison, spendingDriver } from '../spending-comparison';
import { buildTrendSeries } from '../transform';
import type { CategorySlice } from '../repository';

function category(id: string, total: number): CategorySlice {
  return {
    categoryId: id,
    name: id,
    icon: 'package',
    color: '#123456',
    total,
    pct: 0,
  };
}

it('explains decreases in a category that has no transactions in the current period', () => {
  const result = spendingDriver(
    [category('food', 100)],
    [category('food', 80), category('travel', 500)],
  );
  expect(result?.category.categoryId).toBe('travel');
  expect(result?.delta).toBe(-500);
});

it('chooses the largest contribution in the direction of the total change', () => {
  expect(
    spendingDriver(
      [category('food', 600), category('rent', 100)],
      [category('food', 100), category('rent', 500)],
    )?.category.categoryId,
  ).toBe('food');
  expect(spendingDriver([], [])).toBeNull();
  expect(
    spendingDriver([category('food', 100)], [category('travel', 100)]),
  ).toBeNull();
});

it('aligns equal elapsed days and preserves exact accumulated cents', () => {
  const current = buildTrendSeries(
    [
      { dateKey: '2026-10-01', expense: 12345, income: 0 },
      { dateKey: '2026-10-03', expense: 2, income: 0 },
    ],
    'day',
    '2026-10-01',
    '2026-10-03',
  );
  const previous = buildTrendSeries(
    [{ dateKey: '2026-09-02', expense: 999, income: 0 }],
    'day',
    '2026-09-01',
    '2026-09-03',
  );
  const points = cumulativeComparison(current, previous, 'day');
  expect(points.map((point) => point.secondaryDetailLabel)).toEqual([
    '2026-09-01',
    '2026-09-02',
    '2026-09-03',
  ]);
  expect(points.map((point) => point.primary)).toEqual([12345, 12345, 12347]);
  expect(points.map((point) => point.secondary)).toEqual([0, 999, 999]);
});

it('includes the full previous month at the endpoint of a shorter historical month', () => {
  const current = buildTrendSeries(
    [{ dateKey: '2024-02-29', expense: 29, income: 0 }],
    'day',
    '2024-02-01',
    '2024-02-29',
  );
  const previous = buildTrendSeries(
    [{ dateKey: '2024-01-31', expense: 31, income: 0 }],
    'day',
    '2024-01-01',
    '2024-01-31',
  );
  const points = cumulativeComparison(current, previous, 'day');
  expect(points.at(-1)).toMatchObject({
    detailLabel: '2024-02-29',
    secondaryDetailLabel: '2024-01-31',
    primary: 29,
    secondary: 31,
  });
  expect(
    points.every((point) => point.secondaryDetailLabel! <= '2024-01-31'),
  ).toBe(true);
});

it('clips weekly endpoints and carries zero buckets through a quarter', () => {
  const current = buildTrendSeries(
    [{ dateKey: '2026-10-01', expense: 7, income: 0 }],
    'day',
    '2026-10-01',
    '2026-10-15',
  );
  const previous = buildTrendSeries([], 'day', '2026-07-01', '2026-07-15');
  const points = cumulativeComparison(current, previous, 'week');
  expect(points.map((point) => point.detailLabel)).toEqual([
    '2026-10-04',
    '2026-10-11',
    '2026-10-15',
  ]);
  expect(points.map((point) => point.primary)).toEqual([7, 7, 7]);
  expect(points.at(-1)?.secondaryDetailLabel).toBe('2026-07-15');
});

it('retains annual month endpoints, empty input, and a one-day period', () => {
  expect(cumulativeComparison([], [], 'day')).toEqual([]);
  const current = buildTrendSeries([], 'day', '2026-01-01', '2026-03-15');
  expect(
    cumulativeComparison(current, [], 'month').map(
      (point) => point.detailLabel,
    ),
  ).toEqual(['2026-01-31', '2026-02-28', '2026-03-15']);
  expect(cumulativeComparison(current.slice(0, 1), [], 'day')).toMatchObject([
    { primary: 0, secondary: 0 },
  ]);
});
