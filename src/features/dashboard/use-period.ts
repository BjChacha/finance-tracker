import { useEffect, useRef, useState } from 'react';
import {
  periodRange,
  shiftPeriodKey,
  toPeriodKey,
  type BudgetPeriod,
} from '@/lib/date';
import {
  parsePeriodParams,
  resolvePeriod,
  selectPeriod,
} from '@/lib/analytics-range';
import { useTodayKey } from '@/lib/use-today-key';

export function usePeriod(
  initial: { period?: string | string[]; key?: string | string[] } = {},
) {
  const today = useTodayKey();
  const [selection, setSelection] = useState(() =>
    parsePeriodParams(initial, today),
  );
  const previousToday = useRef(today);
  useEffect(() => {
    const before = previousToday.current;
    if (before === today) return;
    previousToday.current = today;
    setSelection((current) =>
      current.key === toPeriodKey(before, current.period)
        ? selectPeriod(current.period, today)
        : current,
    );
  }, [today]);
  const setPeriod = (period: BudgetPeriod) =>
    setSelection((current) => {
      const [start, end] = periodRange(current.period, current.key);
      return selectPeriod(
        period,
        start <= today && end >= today ? today : start,
      );
    });
  const shift = (delta: number) =>
    setSelection((current) => {
      const key = shiftPeriodKey(current.period, current.key, delta);
      return key <= toPeriodKey(today, current.period)
        ? { ...current, key }
        : current;
    });
  return {
    selection,
    setPeriod,
    shift,
    today,
    canNext: selection.key < toPeriodKey(today, selection.period),
    ...resolvePeriod(selection, today),
  };
}
