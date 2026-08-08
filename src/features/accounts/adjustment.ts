/**
 * 余额调整的纯领域逻辑（不依赖 DB，便于单测）。
 * 账户余额是计算值（initialBalance + Σ交易），「调整」要么新增一笔交易，要么改 initialBalance；
 * 这里只负责把「当前余额 → 实际余额」的差额换算成调整方向与金额。
 */

export type AdjustmentPlan = {
  /** 有符号差额（分）：实际 − 当前 */
  delta: number;
  /** 调整方向：delta>0→income（补记收入），delta<0→expense（补记支出），=0→null */
  scope: 'income' | 'expense' | null;
  /** |delta|，作为交易金额（>0）；scope=null 时为 0 */
  amount: number;
};

/** 计算余额调整计划。 */
export function planAdjustment(currentCents: number, actualCents: number): AdjustmentPlan {
  const delta = actualCents - currentCents;
  if (delta === 0) return { delta: 0, scope: null, amount: 0 };
  return {
    delta,
    scope: delta > 0 ? 'income' : 'expense',
    amount: Math.abs(delta),
  };
}
