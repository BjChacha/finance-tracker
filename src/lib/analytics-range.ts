import {
  dayjs,
  periodRange,
  shiftPeriodKey,
  toPeriodKey,
  type BudgetPeriod,
} from './date';

export type DateRange = { start: string; end: string };
export type PeriodSelection = { period: BudgetPeriod; key: string };

export function isDateKey(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    dayjs(value).isValid() &&
    dayjs(value).format('YYYY-MM-DD') === value
  );
}

export function resolvePeriod(selection: PeriodSelection, today: string) {
  const [start, fullEnd] = periodRange(selection.period, selection.key);
  const end = fullEnd < today ? fullEnd : today;
  const previousKey = shiftPeriodKey(selection.period, selection.key, -1);
  const [previousStart, previousFullEnd] = periodRange(
    selection.period,
    previousKey,
  );
  const elapsedDays = Math.max(0, dayjs(end).diff(dayjs(start), 'day') + 1);
  const comparableEnd = dayjs(previousStart)
    .add(elapsedDays - 1, 'day')
    .format('YYYY-MM-DD');
  const previousEnd =
    fullEnd <= today || comparableEnd > previousFullEnd
      ? previousFullEnd
      : comparableEnd;
  return {
    range: { start, end },
    comparison: { start: previousStart, end: previousEnd },
    elapsedDays,
    granularity:
      selection.period === 'month'
        ? ('day' as const)
        : selection.period === 'quarter'
          ? ('week' as const)
          : ('month' as const),
  };
}

export function selectPeriod(
  period: BudgetPeriod,
  anchor: string,
): PeriodSelection {
  return { period, key: toPeriodKey(anchor, period) };
}

export function parsePeriodParams(
  params: { period?: string | string[]; key?: string | string[] },
  today: string,
): PeriodSelection {
  const { period, key } = params;
  if (
    (period === 'month' || period === 'quarter' || period === 'year') &&
    typeof key === 'string'
  ) {
    const valid =
      period === 'month'
        ? /^\d{4}-(0[1-9]|1[0-2])$/.test(key)
        : period === 'quarter'
          ? /^\d{4}-Q[1-4]$/.test(key)
          : /^\d{4}$/.test(key);
    if (valid) {
      const [start] = periodRange(period, key);
      if (isDateKey(start) && start <= today) return { period, key };
    }
  }
  return selectPeriod('month', today);
}

export function amountChange(current: number, previous: number) {
  return {
    delta: current - previous,
    percent:
      previous > 0
        ? Math.round(((current - previous) / previous) * 1000) / 10
        : null,
  };
}
