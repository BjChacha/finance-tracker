import { planAdjustment } from '../adjustment';

describe('planAdjustment', () => {
  it('实际 > 当前 → income（补记收入）', () => {
    expect(planAdjustment(100000, 150000)).toEqual({
      delta: 50000,
      scope: 'income',
      amount: 50000,
    });
  });

  it('实际 < 当前 → expense（补记支出）', () => {
    expect(planAdjustment(150000, 120000)).toEqual({
      delta: -30000,
      scope: 'expense',
      amount: 30000,
    });
  });

  it('实际 == 当前 → 无差额（scope=null，不产生交易/改动）', () => {
    expect(planAdjustment(123456, 123456)).toEqual({ delta: 0, scope: null, amount: 0 });
  });

  it('支持向 0 调整（清空余额）→ 全额补记支出', () => {
    expect(planAdjustment(80000, 0)).toEqual({ delta: -80000, scope: 'expense', amount: 80000 });
  });

  it('支持从 0 调整（补设余额）→ 全额补记收入', () => {
    expect(planAdjustment(0, 9999)).toEqual({ delta: 9999, scope: 'income', amount: 9999 });
  });

  it('支持负债方向：当前为负、实际更负', () => {
    // 信用卡当前 -5000，实际 -8000 → 再降 3000 → expense
    expect(planAdjustment(-5000, -8000)).toEqual({ delta: -3000, scope: 'expense', amount: 3000 });
  });

  it('支持从负债回升：当前 -5000，实际 -2000 → 补记收入 3000', () => {
    expect(planAdjustment(-5000, -2000)).toEqual({ delta: 3000, scope: 'income', amount: 3000 });
  });

  it('amount 恒为正（交易金额不能为负/零，scope!=null 时 >0）', () => {
    expect(planAdjustment(100, 101).amount).toBeGreaterThan(0);
    expect(planAdjustment(101, 100).amount).toBeGreaterThan(0);
  });
});
