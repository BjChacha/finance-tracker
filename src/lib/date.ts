import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

dayjs.locale('zh-cn');

export { dayjs };

/** 生成 'YYYY-MM-DD' date_key（按设备本地时区固化，写入后不再随时区变化） */
export function toDateKey(date: Date | number | string): string {
  return dayjs(date).format('YYYY-MM-DD');
}

/** date_key → 月份键 'YYYY-MM' */
export function toMonthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** 某月第一天/最后一天的 date_key */
export function monthRange(monthKey: string): [string, string] {
  const start = dayjs(`${monthKey}-01`);
  return [start.format('YYYY-MM-DD'), start.endOf('month').format('YYYY-MM-DD')];
}

/** 今天的 date_key */
export function todayKey(): string {
  return dayjs().format('YYYY-MM-DD');
}

/** 昨天的 date_key */
export function yesterdayKey(): string {
  return dayjs().subtract(1, 'day').format('YYYY-MM-DD');
}

/** 时间戳 → 'HH:mm'（交易条目展示时分用） */
export function formatTime(ts: number): string {
  return dayjs(ts).format('HH:mm');
}

/**
 * 把 'YYYY-MM-DD' 与 'HH:mm' 组合为**本地时区**的 Unix 毫秒时间戳。
 * 交易同时含日期与时间：date 列本就是毫秒整数，这里只负责在保存时把两者拼起来。
 * 输入需已通过格式校验；非法输入返回 NaN（交由调用方防御）。
 */
export function combineDateAndTime(dateKey: string, hhmm: string): number {
  return dayjs(`${dateKey} ${hhmm}`).valueOf();
}

/** 明细列表的日期分组标题，如 "07月05日 星期六" */
export function formatDayHeader(dateKey: string): string {
  return dayjs(dateKey).format('MM月DD日 dddd');
}

/**
 * 计算周期规则的下一次运行日期（返回 date_key）。
 * - daily: from + interval 天
 * - weekly: 下一个符合 anchor（1=周一..7=周日）的日期，步进 interval 周
 * - monthly: 下月同 anchor 号；anchor 超过当月天数则取月末（月末对齐）
 * - yearly: 明年 anchor（MMDD）；0229 在平年取 0228
 */
export function nextRunDate(
  fromKey: string,
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly',
  interval: number,
  anchor: number,
): string {
  const from = dayjs(fromKey);
  switch (frequency) {
    case 'daily':
      return from.add(interval, 'day').format('YYYY-MM-DD');
    case 'weekly': {
      // dayjs: 0=周日..6=周六；anchor: 1=周一..7=周日
      const targetDow = anchor % 7;
      let next = from.add(interval, 'week');
      const diff = targetDow - next.day();
      next = next.add(diff, 'day');
      return next.format('YYYY-MM-DD');
    }
    case 'monthly': {
      const next = from.add(interval, 'month');
      const dom = Math.min(anchor, next.daysInMonth());
      return next.date(dom).format('YYYY-MM-DD');
    }
    case 'yearly': {
      const mm = Math.floor(anchor / 100);
      const dd = anchor % 100;
      const next = from.add(interval, 'year');
      const candidate = dayjs(`${next.year()}-${String(mm).padStart(2, '0')}-01`);
      const dom = Math.min(dd, candidate.daysInMonth());
      return candidate.date(dom).format('YYYY-MM-DD');
    }
  }
}

/** 预算周期：月 / 自然季 / 自然年 */
export type BudgetPeriod = 'month' | 'quarter' | 'year';

const QUARTER_KEY_RE = /^(\d{4})-Q([1-4])$/;
const PERIOD_KEYS: readonly BudgetPeriod[] = ['month', 'quarter', 'year'];
export const BUDGET_PERIODS = PERIOD_KEYS;

/** dateKey → periodKey（月 'YYYY-MM' / 季 'YYYY-Qn' / 年 'YYYY'） */
export function toPeriodKey(dateKey: string, period: BudgetPeriod): string {
  const year = dateKey.slice(0, 4);
  switch (period) {
    case 'month':
      return dateKey.slice(0, 7);
    case 'year':
      return year;
    case 'quarter': {
      const month = Number(dateKey.slice(5, 7));
      const q = Math.floor((month - 1) / 3) + 1;
      return `${year}-Q${q}`;
    }
  }
}

/** periodKey → 周期首末的 dateKey（闭区间，与 monthRange 同口径） */
export function periodRange(period: BudgetPeriod, periodKey: string): [string, string] {
  switch (period) {
    case 'month':
      return monthRange(periodKey);
    case 'year':
      return [`${periodKey}-01-01`, `${periodKey}-12-31`];
    case 'quarter': {
      const m = QUARTER_KEY_RE.exec(periodKey);
      if (!m) throw new Error(`Invalid quarter periodKey: ${periodKey}`);
      const startMonth = (Number(m[2]) - 1) * 3 + 1;
      const start = dayjs(`${m[1]}-${String(startMonth).padStart(2, '0')}-01`);
      const end = start.add(2, 'month').endOf('month');
      return [start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')];
    }
  }
}

/** 给定日期所在周期的 periodKey；默认取今天 */
export function currentPeriodKey(period: BudgetPeriod, refKey = todayKey()): string {
  return toPeriodKey(refKey, period);
}

/**
 * 周期内剩余天数（含今天）：
 * - 过去周期返回 0（已成历史，无「可用」概念）
 * - 未来周期返回整周期天数
 * - 当前周期返回从今天到周期末（含）的天数
 */
export function daysRemainingInPeriod(
  period: BudgetPeriod,
  periodKey: string,
  refKey = todayKey(),
): number {
  const [start, end] = periodRange(period, periodKey);
  if (refKey < start) return dayjs(end).diff(dayjs(start), 'day') + 1;
  if (refKey > end) return 0;
  return dayjs(end).diff(dayjs(refKey), 'day') + 1;
}

/** 周期展示标题：月 'YYYY年MM月' / 季 'YYYY年 Qn' / 年 'YYYY年' */
export function formatPeriodTitle(period: BudgetPeriod, periodKey: string): string {
  switch (period) {
    case 'month':
      return dayjs(`${periodKey}-01`).format('YYYY年MM月');
    case 'year':
      return `${periodKey}年`;
    case 'quarter': {
      const m = QUARTER_KEY_RE.exec(periodKey);
      if (!m) throw new Error(`Invalid quarter periodKey: ${periodKey}`);
      return `${m[1]}年 Q${m[2]}`;
    }
  }
}

/** periodKey 前后平移 delta 个周期（月 ±N 月 / 年 ±N 年 / 季 ±N 季，跨年自动进位） */
export function shiftPeriodKey(period: BudgetPeriod, periodKey: string, delta: number): string {
  switch (period) {
    case 'month':
      return dayjs(`${periodKey}-01`).add(delta, 'month').format('YYYY-MM');
    case 'year':
      return String(Number(periodKey) + delta);
    case 'quarter': {
      const m = QUARTER_KEY_RE.exec(periodKey);
      if (!m) throw new Error(`Invalid quarter periodKey: ${periodKey}`);
      let year = Number(m[1]);
      let q = Number(m[2]) + delta;
      while (q < 1) {
        q += 4;
        year -= 1;
      }
      while (q > 4) {
        q -= 4;
        year += 1;
      }
      return `${year}-Q${q}`;
    }
  }
}
