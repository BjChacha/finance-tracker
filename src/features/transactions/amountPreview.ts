import { evalMoneyExpr, hasPendingOp } from '@/lib/calc';
import { toBaseCents } from '@/lib/money';

export type AmountPreview = {
  /** 表达式求值结果（整数分）；空串/非法/除 0 为 null */
  evaluated: number | null;
  /** 表达式含待计算运算符时的实时求值预览（「= xx」），否则 null */
  opPreview: number | null;
  /** 外币且金额为正时折算到本位币 CNY 的整数分（「≈ ¥xx」），否则 null */
  baseCents: number | null;
};

/**
 * 金额输入的展示层预览：金额框与记账键盘顶部显示区共用的单一出处。
 * rateScaled 为 ×1e6 定点汇率（CNY 恒传 RATE_SCALE）。
 */
export function computeAmountPreview(
  amountText: string,
  currency: string,
  rateScaled: number,
): AmountPreview {
  const evaluated = evalMoneyExpr(amountText);
  const opPreview = hasPendingOp(amountText) ? evaluated : null;
  const baseCents =
    currency !== 'CNY' && evaluated !== null && evaluated > 0
      ? toBaseCents(evaluated, rateScaled)
      : null;
  return { evaluated, opPreview, baseCents };
}
