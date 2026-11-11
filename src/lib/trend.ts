/**
 * 趋势方向语义色（Sure `Trend#favorable_direction` 的本地版）。
 *
 * 同一个「+12%」，支出着红、收入/净值着绿——颜色表达的是「好消息还是坏消息」，
 * 而不是数字的正负。红色只留给坏消息（支出上升、净资产下降），避免满屏红。
 */
export type TrendColors = {
  /** 好消息色（语义上沿用 income 绿） */
  income: string;
  /** 坏消息色（语义上沿用 expense 红） */
  expense: string;
  /** 持平/无变化 */
  textSecondary: string;
};

/**
 * 按变化量与方向好坏取语义色。
 * @param delta 变化量（current - previous）
 * @param upIsGood 该指标上升是否为好消息（支出=false、收入/净资产=true）
 */
export function trendColor(
  delta: number,
  upIsGood: boolean,
  colors: TrendColors,
): string {
  if (delta > 0) return upIsGood ? colors.income : colors.expense;
  if (delta < 0) return upIsGood ? colors.expense : colors.income;
  return colors.textSecondary;
}
