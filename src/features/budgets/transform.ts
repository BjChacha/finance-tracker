import { daysRemainingInPeriod, type BudgetPeriod } from '@/lib/date';

/** 预算进度百分比（一位小数）；额度为 0 返回 0。可超过 100。 */
export function budgetPct(spent: number, amount: number): number {
  if (amount <= 0) return 0;
  return Math.round((spent / amount) * 1000) / 10;
}

export type BudgetLevel = 'ok' | 'warn' | 'over';

/** 页内展示状态：已用达额度=over（红），达提醒阈值=warn（黄，阈值 100 时无 warn 档），否则 ok */
export function budgetLevel(spent: number, amount: number, alertPct: number): BudgetLevel {
  if (amount > 0 && spent >= amount) return 'over';
  if (alertPct < 100 && amount > 0 && spent * 100 >= amount * alertPct) return 'warn';
  return 'ok';
}

/**
 * 当前跨过的最高提醒档位：
 * - 100：已用 >= 额度（超支档，alertPct=100 时也只走这一档）
 * - alertPct：已用比例达到阈值但未超支（阈值档）
 * - null：未达任何档位
 * 整数分运算不经浮点，避免边界误判。
 */
export function crossedTier(spent: number, amount: number, alertPct: number): number | null {
  if (amount <= 0) return null;
  if (spent >= amount) return 100;
  if (alertPct < 100 && spent * 100 >= amount * alertPct) return alertPct;
  return null;
}

/**
 * 日均可用（分/天，向下取整）：剩余额度 / 周期剩余天数（含今天）。
 * - 过去周期返回 0（已成历史，无「可用」概念）
 * - 未来周期按整周期天数平摊
 * - 剩余 <= 0 返回 0
 */
export function dailyAvailable(
  remaining: number,
  period: BudgetPeriod,
  periodKey: string,
  todayK: string,
): number {
  if (remaining <= 0) return 0;
  const days = daysRemainingInPeriod(period, periodKey, todayK);
  return days > 0 ? Math.floor(remaining / days) : 0;
}
