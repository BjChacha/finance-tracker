import type { RecurringFrequency } from '@/db/schema';
import { dayjs, nextRunDate } from '@/lib/date';

/** catchUp / 推进计算所需的规则调度字段 */
export type RuleSchedule = {
  frequency: RecurringFrequency;
  interval: number;
  anchor: number;
  /** 'YYYY-MM-DD'，下一次应运行日期 */
  nextRunDate: string;
  /** 'YYYY-MM-DD' 或 null（长期有效） */
  endDate: string | null;
};

/** 防御上限：异常数据（如 interval=0）不会死循环 */
const MAX_STEPS = 1000;

/**
 * 规则创建/编辑时：把开始日期对齐到锚点后的首个运行日期（>= startDate）。
 * - daily：startDate 当天即首期（daily 无锚点概念）
 * - weekly：startDate 恰为 anchor 星期几则当天，否则顺延到最近的该星期几（首期就近，不跨 interval）
 * - monthly：当月 anchor 号（超过当月天数取月末对齐）；若已早于 startDate 则推到下月锚点
 * - yearly：当年 MMDD（0229 平年取 0228）；若已早于 startDate 则推到明年
 */
export function alignToAnchor(
  startDate: string,
  frequency: RecurringFrequency,
  anchor: number,
): string {
  const start = dayjs(startDate);
  switch (frequency) {
    case 'daily':
      return startDate;
    case 'weekly': {
      // anchor: 1=周一..7=周日；dayjs .day(): 0=周日..6=周六
      const targetDow = anchor % 7;
      const diff = (targetDow - start.day() + 7) % 7;
      return start.add(diff, 'day').format('YYYY-MM-DD');
    }
    case 'monthly': {
      const dom = Math.min(anchor, start.daysInMonth());
      const candidate = start.date(dom);
      if (!candidate.isBefore(start, 'day')) return candidate.format('YYYY-MM-DD');
      return nextRunDate(candidate.format('YYYY-MM-DD'), 'monthly', 1, anchor);
    }
    case 'yearly': {
      const mm = Math.floor(anchor / 100);
      const dd = anchor % 100;
      const firstOfMonth = dayjs(`${start.year()}-${String(mm).padStart(2, '0')}-01`);
      const candidate = firstOfMonth.date(Math.min(dd, firstOfMonth.daysInMonth()));
      if (!candidate.isBefore(start, 'day')) return candidate.format('YYYY-MM-DD');
      return nextRunDate(candidate.format('YYYY-MM-DD'), 'yearly', 1, anchor);
    }
  }
}

/**
 * 从 nextRunDate 推进到 today（含）应生成的全部日期序列（补账用）。
 * endDate 截断：超出 endDate 的日期不生成。纯函数，不修改规则。
 */
export function generateRunDates(rule: RuleSchedule, today: string): string[] {
  const dates: string[] = [];
  let cur = rule.nextRunDate;
  while (cur <= today && (rule.endDate === null || cur <= rule.endDate)) {
    dates.push(cur);
    if (dates.length >= MAX_STEPS) break;
    cur = nextRunDate(cur, rule.frequency, rule.interval, rule.anchor);
  }
  return dates;
}

/**
 * catchUp 后的指针推进：返回新的 nextRunDate（第一个 > today 或 > endDate 的日期）
 * 与 expired（下一期已超出 endDate，规则应停用）。
 */
export function advanceRule(
  rule: RuleSchedule,
  today: string,
): { nextRun: string; expired: boolean } {
  let cur = rule.nextRunDate;
  let steps = 0;
  while (cur <= today && (rule.endDate === null || cur <= rule.endDate) && steps < MAX_STEPS) {
    cur = nextRunDate(cur, rule.frequency, rule.interval, rule.anchor);
    steps++;
  }
  return { nextRun: cur, expired: rule.endDate !== null && cur > rule.endDate };
}

/** 待确认"记入/跳过"的单步推进 */
export function advanceOneStep(rule: RuleSchedule): { nextRun: string; expired: boolean } {
  const next = nextRunDate(rule.nextRunDate, rule.frequency, rule.interval, rule.anchor);
  return { nextRun: next, expired: rule.endDate !== null && next > rule.endDate };
}

const WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'] as const;

/** 频率的中文描述，如 "每月1日"、"每2周·周三"、"每年5月1日"、"每月月末" */
export function describeFrequency(
  frequency: RecurringFrequency,
  interval: number,
  anchor: number,
): string {
  switch (frequency) {
    case 'daily':
      return interval > 1 ? `每${interval}天` : '每天';
    case 'weekly': {
      const day = WEEKDAY_NAMES[(((anchor - 1) % 7) + 7) % 7];
      return interval > 1 ? `每${interval}周·周${day}` : `每周${day}`;
    }
    case 'monthly': {
      const dom = anchor >= 31 ? '月末' : `${anchor}日`;
      return interval > 1 ? `每${interval}个月·${dom}` : `每月${dom}`;
    }
    case 'yearly': {
      const md = `${Math.floor(anchor / 100)}月${anchor % 100}日`;
      return interval > 1 ? `每${interval}年·${md}` : `每年${md}`;
    }
  }
}
