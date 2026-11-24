import { dayjs } from '@/lib/date';

/**
 * 工作日分布的纯数据模型。
 *
 * 拆出来是为了单测不加载数据库（jest 里 expo-sqlite 不可用），
 * 查询层在 weekday.ts。
 */

/** 周一 = 0 … 周日 = 6 */
export const WEEKDAY_NAMES = [
  '周一',
  '周二',
  '周三',
  '周四',
  '周五',
  '周六',
  '周日',
] as const;

export type WeekdayStat = {
  /** 0=周一 … 6=周日 */
  weekday: number;
  name: string;
  /** 合计（本位币分） */
  total: number;
  /** 该星期几在区间内出现的天数（含没有支出的日子） */
  days: number;
  /** 日均（本位币分） */
  dailyAvg: number;
  /** 交易笔数 */
  count: number;
};

/** dateKey 的星期索引：周一=0 … 周日=6（dayjs 的 day() 是周日=0） */
export function weekdayIndex(dateKey: string): number {
  return (dayjs(dateKey).day() + 6) % 7;
}

/**
 * 纯函数：按星期几聚合。
 *
 * 日均的分母取「该星期几在区间内出现的天数」，**包含没有支出的日子**：
 * 若只统计有支出的日子，月初月末那种只有零星几天的星期几会被算得异常高，
 * 七天之间就不可比了。
 */
export function buildWeekdayStats(
  rows: readonly { dateKey: string; total: number; count: number }[],
  dates: readonly string[],
): WeekdayStat[] {
  const totals = new Array<number>(7).fill(0);
  const counts = new Array<number>(7).fill(0);
  const days = new Array<number>(7).fill(0);

  for (const dateKey of dates) {
    days[weekdayIndex(dateKey)] += 1;
  }
  for (const row of rows) {
    const index = weekdayIndex(row.dateKey);
    totals[index] += row.total;
    counts[index] += row.count;
  }

  return WEEKDAY_NAMES.map((name, weekday) => {
    const total = totals[weekday]!;
    const dayCount = days[weekday]!;
    return {
      weekday,
      name,
      total,
      days: dayCount,
      dailyAvg: dayCount > 0 ? Math.round(total / dayCount) : 0,
      count: counts[weekday]!,
    };
  });
}

/** 区间内每个日期的 dateKey（含首尾），用于日均分母 */
export function datesInRange(start: string, end: string): string[] {
  if (start > end) return [];
  const out: string[] = [];
  let cursor = dayjs(start);
  const last = dayjs(end);
  // 上限保护：异常区间不应让渲染线程空转
  for (let guard = 0; guard < 4000 && !cursor.isAfter(last, 'day'); guard += 1) {
    out.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }
  return out;
}

/** 工作日 / 周末汇总（图表上方那行结论） */
export function weekdaySummary(stats: readonly WeekdayStat[]) {
  const weekdayDays = stats.slice(0, 5).reduce((sum, item) => sum + item.days, 0);
  const weekendDays = stats.slice(5).reduce((sum, item) => sum + item.days, 0);
  const weekdayTotal = stats.slice(0, 5).reduce((sum, item) => sum + item.total, 0);
  const weekendTotal = stats.slice(5).reduce((sum, item) => sum + item.total, 0);
  const total = weekdayTotal + weekendTotal;
  return {
    weekdayAvg: weekdayDays > 0 ? Math.round(weekdayTotal / weekdayDays) : 0,
    weekendAvg: weekendDays > 0 ? Math.round(weekendTotal / weekendDays) : 0,
    /** 周末支出占比（0-1）；无支出时为 null */
    weekendShare: total > 0 ? weekendTotal / total : null,
    total,
  };
}
