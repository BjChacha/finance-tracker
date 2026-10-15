import { dayjs } from '@/lib/date';
import type { CategorySlice } from './repository';
import { bucketKey, type TrendGranularity, type TrendPoint } from './transform';

export function spendingDriver(
  current: CategorySlice[],
  previous: CategorySlice[],
) {
  const after = new Map(current.map((item) => [item.categoryId, item]));
  const before = new Map(previous.map((item) => [item.categoryId, item]));
  const delta =
    current.reduce((sum, item) => sum + item.total, 0) -
    previous.reduce((sum, item) => sum + item.total, 0);
  if (delta === 0) return null;
  return (
    [...new Set([...after.keys(), ...before.keys()])]
      .map((id) => {
        const category = after.get(id) ?? before.get(id)!;
        return {
          category,
          delta: (after.get(id)?.total ?? 0) - (before.get(id)?.total ?? 0),
        };
      })
      .filter((item) => Math.sign(item.delta) === Math.sign(delta))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] ?? null
  );
}

/** Align interval progress, retaining actual dates and integer cents on both sides. */
export function cumulativeComparison(
  current: TrendPoint[],
  previous: TrendPoint[],
  granularity: TrendGranularity,
) {
  let currentTotal = 0;
  let previousTotal = 0;
  const before = previous.map((point) => {
    previousTotal += point.expense;
    return { date: point.key, total: previousTotal };
  });
  return current.flatMap((point, index) => {
    currentTotal += point.expense;
    const next = current[index + 1];
    if (
      next &&
      bucketKey(point.key, granularity) === bucketKey(next.key, granularity)
    ) {
      return [];
    }
    // Unequal complete months/quarters must still end at both complete totals.
    const previousIndex = Math.max(
      0,
      Math.round(((index + 1) * before.length) / current.length) - 1,
    );
    const comparison = before[previousIndex];
    return [
      {
        label: dayjs(point.key).format(granularity === 'month' ? 'M' : 'M.D'),
        detailLabel: point.key,
        secondaryDetailLabel: comparison?.date,
        primary: currentTotal,
        secondary: comparison?.total ?? 0,
      },
    ];
  });
}
