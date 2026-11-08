import type { PersonalAsset } from '@/db/schema';
import type { RecurringInput } from '@/features/recurring/repository';
import { dayjs, todayKey } from '@/lib/date';

/**
 * 分期购买计算（纯函数，离线确定性）。
 *
 * 两种利息输入模式：
 * - total：直接给定总利息金额 → 每期 = round((本金+总利息)/期数)（等额平摊）；
 * - annual-rate：给定年化利率 → 按**等额本息**公式算每期，总利息 = 每期×期数 − 本金。
 *
 * 尾差：每期四舍五入到分，末期差额忽略；结算总利息以「每期×期数 − 本金」为准。
 * 周期记账规则金额固定为每期金额，因此期末尾差（≤ 期数×0.5 分）不逐期修正。
 */

export const MAX_INSTALLMENT_PERIODS = 60;
export const MIN_INSTALLMENT_PERIODS = 1;
/** 年化利率存储精度：rate% × 100（12.5% → 1250） */
export const ANNUAL_RATE_SCALE = 100;

export type InstallmentInterestMode = 'total' | 'annual-rate';

export type InstallmentPlanInput = {
  /** 物品总价（本位币分） */
  totalCents: number;
  /** 首付（本位币分） */
  downPaymentCents: number;
  /** 分期期数 1-60 */
  periods: number;
  interestMode: InstallmentInterestMode;
  /** total 模式：总利息（分） */
  totalInterestCents?: number | null;
  /** annual-rate 模式：年化利率 × 100 */
  annualRateScaled?: number | null;
};

export type InstallmentPlan = {
  /** 融资本金 = 总价 − 首付 */
  principalCents: number;
  /** 每期金额（分） */
  perPeriodCents: number;
  /** 实际总利息 = 每期×期数 − 本金（已吸收尾差） */
  totalInterestCents: number;
  /** 总还款 = 每期×期数 */
  totalRepayCents: number;
  /** 首期还款日 */
  firstDueDateKey: string;
  /** 末期还款日 = 首期日 + (期数-1) 个月 */
  endDateKey: string;
  /** 规则锚点（首期日的日号） */
  anchorDay: number;
};

/** 年化利率 → 月利率（小数）；非法/负数按 0 处理 */
function monthlyRate(annualRateScaled: number | null | undefined): number {
  if (typeof annualRateScaled !== 'number' || !Number.isFinite(annualRateScaled) || annualRateScaled < 0) {
    return 0;
  }
  return annualRateScaled / ANNUAL_RATE_SCALE / 100 / 12;
}

/** 首期日 + (期数-1) 个月（dayjs 月末自动对齐） */
export function installmentEndDateKey(firstDueDateKey: string, periods: number): string {
  return dayjs(firstDueDateKey)
    .add(Math.max(0, periods - 1), 'month')
    .format('YYYY-MM-DD');
}

/** 分期表单校验（纯函数）：返回中文错误文案，通过返回 null */
export function validateInstallmentInput(
  input: InstallmentPlanInput,
  options: { acquiredDateKey: string; firstDueDateKey: string },
): string | null {
  const { totalCents, downPaymentCents, periods, interestMode } = input;
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) return '总价必须为正数';
  if (!Number.isSafeInteger(downPaymentCents) || downPaymentCents < 0) return '首付格式不正确';
  if (downPaymentCents >= totalCents) return '首付必须小于总价';
  if (!Number.isSafeInteger(periods) || periods < MIN_INSTALLMENT_PERIODS || periods > MAX_INSTALLMENT_PERIODS) {
    return `期数必须为 ${MIN_INSTALLMENT_PERIODS}-${MAX_INSTALLMENT_PERIODS} 的整数`;
  }
  if (interestMode === 'total') {
    const interest = input.totalInterestCents ?? 0;
    if (!Number.isSafeInteger(interest) || interest < 0) return '总利息格式不正确';
  } else {
    const rate = input.annualRateScaled ?? 0;
    if (!Number.isSafeInteger(rate) || rate < 0) return '年化利率格式不正确';
  }
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(options.acquiredDateKey)) return '取得日期格式不正确';
  if (!datePattern.test(options.firstDueDateKey)) return '首期还款日格式不正确';
  if (!dayjs(options.firstDueDateKey, 'YYYY-MM-DD').isValid() ||
      dayjs(options.firstDueDateKey).format('YYYY-MM-DD') !== options.firstDueDateKey) {
    return '首期还款日格式不正确';
  }
  if (options.firstDueDateKey <= options.acquiredDateKey) return '首期还款日必须晚于取得日期';
  return null;
}

/** 计算分期计划（调用前应先通过 validateInstallmentInput） */
export function buildInstallmentPlan(
  input: InstallmentPlanInput,
  firstDueDateKey: string,
): InstallmentPlan {
  const principalCents = input.totalCents - input.downPaymentCents;
  const periods = input.periods;

  let perPeriodCents: number;
  if (input.interestMode === 'annual-rate') {
    const r = monthlyRate(input.annualRateScaled);
    const compound = Math.pow(1 + r, periods);
    const raw = r === 0 ? principalCents / periods : (principalCents * r * compound) / (compound - 1);
    perPeriodCents = Math.round(raw);
  } else {
    const interest = Math.max(0, Math.trunc(input.totalInterestCents ?? 0));
    perPeriodCents = Math.round((principalCents + interest) / periods);
  }
  if (perPeriodCents < 1) throw new Error('每期金额过小，请调整期数或利息');

  const totalRepayCents = perPeriodCents * periods;
  return {
    principalCents,
    perPeriodCents,
    totalInterestCents: totalRepayCents - principalCents,
    totalRepayCents,
    firstDueDateKey,
    endDateKey: installmentEndDateKey(firstDueDateKey, periods),
    anchorDay: dayjs(firstDueDateKey).date(),
  };
}

/** 由分期计划组装周期记账规则入参（期次交易生成引擎） */
export function buildInstallmentRuleInput(
  assetName: string,
  plan: InstallmentPlan,
  options: { accountId: string; categoryId: string; autoCreate: boolean },
): RecurringInput {
  const label = `分期：${assetName}`;
  return {
    name: label,
    type: 'expense',
    amount: plan.perPeriodCents,
    accountId: options.accountId,
    toAccountId: null,
    categoryId: options.categoryId,
    note: label,
    frequency: 'monthly',
    interval: 1,
    anchor: plan.anchorDay,
    startDate: plan.firstDueDateKey,
    endDate: plan.endDateKey,
    autoCreate: options.autoCreate,
  };
}

export type InstallmentProgress = {
  /** 总期数 */
  periods: number;
  /** 已还期数（规则缺失时按日期回退推算） */
  paidPeriods: number;
  /** 剩余期数（已结清为 0） */
  remainingPeriods: number;
  /** 每期金额（分） */
  perPeriodCents: number;
  /** 总还款 = 每期 × 期数（分） */
  totalRepayCents: number;
  /** 已支付金额（首付 + 已还期次，分） */
  paidCents: number;
  /** 剩余应还（分；已结清为 0） */
  remainingCents: number;
  /** 下一期还款日；无剩余或已结清为 null */
  nextDueDateKey: string | null;
  /** 是否提前结清 */
  settled: boolean;
};

/** 规则缺失时的回退推算：从首期日起逐期比较「到期日 ≤ 今天」的期数（封顶总期数） */
function fallbackPaidPeriods(
  firstDueDateKey: string,
  periods: number,
  today: string,
): number {
  let paid = 0;
  let cursor = dayjs(firstDueDateKey);
  while (paid < periods && cursor.format('YYYY-MM-DD') <= today) {
    paid += 1;
    cursor = cursor.add(1, 'month');
  }
  return paid;
}

/**
 * 分期进度：
 * - 正常：已还期数 = 关联规则已生成期次交易数；
 * - 规则被删除（generatedPeriods = null）时按日期回退（首期日起每满一期计一期，封顶）；
 * - 已结清：剩余期数/剩余应还均记 0（不再生成）。
 */
export function installmentProgress(
  asset: Pick<
    PersonalAsset,
    | 'costCents'
    | 'installmentPeriods'
    | 'installmentDownPaymentCents'
    | 'installmentInterestCents'
    | 'installmentFirstDueDateKey'
    | 'installmentClosedDateKey'
  >,
  generatedPeriods: number | null,
  today = todayKey(),
): InstallmentProgress | null {
  const periods = asset.installmentPeriods;
  if (!Number.isSafeInteger(periods) || periods <= 0) return null;

  const principal = Math.max(0, asset.costCents - asset.installmentDownPaymentCents);
  const interest = Math.max(0, asset.installmentInterestCents ?? 0);
  // 创建时结算的关系：实际总利息 = 每期×期数 − 本金 → 可精确反推每期金额
  const perPeriodCents = Math.round((principal + interest) / periods);
  const totalRepayCents = perPeriodCents * periods;
  const settled = asset.installmentClosedDateKey !== null;

  let paidPeriods: number;
  if (generatedPeriods !== null) {
    paidPeriods = Math.max(0, Math.min(periods, generatedPeriods));
  } else if (asset.installmentFirstDueDateKey) {
    paidPeriods = fallbackPaidPeriods(asset.installmentFirstDueDateKey, periods, today);
  } else {
    paidPeriods = 0;
  }

  const remainingPeriods = settled ? 0 : Math.max(0, periods - paidPeriods);
  const nextDueDateKey =
    settled || remainingPeriods === 0 || !asset.installmentFirstDueDateKey
      ? null
      : dayjs(asset.installmentFirstDueDateKey).add(paidPeriods, 'month').format('YYYY-MM-DD');

  return {
    periods,
    paidPeriods,
    remainingPeriods,
    perPeriodCents,
    totalRepayCents,
    paidCents: Math.max(0, asset.installmentDownPaymentCents) + paidPeriods * perPeriodCents,
    remainingCents: remainingPeriods * perPeriodCents,
    nextDueDateKey,
    settled,
  };
}
