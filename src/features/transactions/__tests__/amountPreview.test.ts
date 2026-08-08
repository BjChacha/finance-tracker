import { RATE_SCALE } from '@/lib/money';
import { computeAmountPreview } from '../amountPreview';

/** USD 兑 CNY 7.2 → ×1e6 定点 */
const USD_RATE = 7_200_000;

describe('computeAmountPreview', () => {
  it('纯数字 CNY：仅 evaluated，无任何辅助预览', () => {
    expect(computeAmountPreview('12.5', 'CNY', RATE_SCALE)).toEqual({
      evaluated: 1250,
      opPreview: null,
      baseCents: null,
    });
  });

  it('含运算符：opPreview 给出求值结果', () => {
    expect(computeAmountPreview('12.5×3', 'CNY', RATE_SCALE)).toEqual({
      evaluated: 3750,
      opPreview: 3750,
      baseCents: null,
    });
  });

  it('尾悬运算符：按 evalMoneyExpr 规则忽略尾悬，仍算 pending', () => {
    expect(computeAmountPreview('12+', 'CNY', RATE_SCALE)).toEqual({
      evaluated: 1200,
      opPreview: 1200,
      baseCents: null,
    });
  });

  it('外币纯数字：baseCents 按汇率折算到本位币', () => {
    expect(computeAmountPreview('100', 'USD', USD_RATE)).toEqual({
      evaluated: 10000,
      opPreview: null,
      baseCents: 72000,
    });
  });

  it('外币 + 运算符：opPreview 与 baseCents 同时给出（展示层优先 opPreview）', () => {
    expect(computeAmountPreview('50+50', 'USD', USD_RATE)).toEqual({
      evaluated: 10000,
      opPreview: 10000,
      baseCents: 72000,
    });
  });

  it.each([
    ['空串', ''],
    ['除 0', '5÷0'],
  ])('%s：全 null', (_name, expr) => {
    expect(computeAmountPreview(expr, 'CNY', RATE_SCALE)).toEqual({
      evaluated: null,
      opPreview: null,
      baseCents: null,
    });
  });

  it('负数结果：opPreview 保留负值，外币折算不做（仅正数折算）', () => {
    expect(computeAmountPreview('5-8', 'USD', USD_RATE)).toEqual({
      evaluated: -300,
      opPreview: -300,
      baseCents: null,
    });
  });

  it('首位负号不算待计算运算符（来自上次求值折叠的负数）', () => {
    expect(computeAmountPreview('-3', 'CNY', RATE_SCALE)).toEqual({
      evaluated: -300,
      opPreview: null,
      baseCents: null,
    });
  });
});
