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
  type DateRange,
} from '@/lib/analytics-range';
import { useAssetHistoryStart } from '@/features/stats/hooks';
import { useTodayKey } from '@/lib/use-today-key';

/**
 * 看板/统计的时间口径。
 *
 * `withAll` 打开后额外提供「全部时间」：区间取「最早出现数据的那天 → 今天」，
 * 交易日与账户创建日更早者优先（与资产曲线的历史起点同源）。此时不存在上一个
 * 可比的周期，所以 `comparison` 显式为 `null`，调用方必须自己决定隐藏还是降级，
 * 而不是拿「全部」去比「上期」得出荒谬的百分比。
 */
export function usePeriod(
  initial: { period?: string | string[]; key?: string | string[] } = {},
  options: { withAll?: boolean } = {},
) {
  const withAll = options.withAll ?? false;
  const today = useTodayKey();
  const [selection, setSelection] = useState(() =>
    parsePeriodParams(initial, today),
  );
  const [all, setAll] = useState(false);
  const allStart = useAssetHistoryStart(withAll && all);
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
  const setPeriod = (period: BudgetPeriod) => {
    setAll(false);
    setSelection((current) => {
      const [start, end] = periodRange(current.period, current.key);
      return selectPeriod(
        period,
        start <= today && end >= today ? today : start,
      );
    });
  };
  const shift = (delta: number) => {
    setAll(false);
    setSelection((current) => {
      const key = shiftPeriodKey(current.period, current.key, delta);
      return key <= toPeriodKey(today, current.period)
        ? { ...current, key }
        : current;
    });
  };
  const resolved = resolvePeriod(selection, today);
  const allRange: DateRange = {
    start: allStart.data ?? resolved.range.start,
    end: today,
  };
  return {
    selection,
    setPeriod,
    shift,
    today,
    canNext: selection.key < toPeriodKey(today, selection.period),
    /** 是否处于「全部时间」口径（页面未开启该选项时恒为 false） */
    all: withAll && all,
    setAll,
    /** 全时间区间的起点查询：未就绪时先按当前周期渲染会显示错数，调用方据此挡一下 */
    allStart,
    ...resolved,
    range: withAll && all ? allRange : resolved.range,
    comparison: withAll && all ? null : resolved.comparison,
    granularity:
      withAll && all ? ('month' as const) : resolved.granularity,
  };
}
