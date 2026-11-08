import {
  MAX_INSTALLMENT_PERIODS,
  buildInstallmentPlan,
  buildInstallmentRuleInput,
  installmentEndDateKey,
  installmentProgress,
  validateInstallmentInput,
  type InstallmentPlanInput,
} from '../installment';

const baseInput: InstallmentPlanInput = {
  totalCents: 120_000, // ¥1200
  downPaymentCents: 20_000, // ¥200
  periods: 10,
  interestMode: 'total',
  totalInterestCents: 10_000, // ¥100
};

describe('validateInstallmentInput', () => {
  const dates = { acquiredDateKey: '2026-01-05', firstDueDateKey: '2026-02-10' };

  it('合法输入通过', () => {
    expect(validateInstallmentInput(baseInput, dates)).toBeNull();
    expect(
      validateInstallmentInput(
        { ...baseInput, interestMode: 'annual-rate', annualRateScaled: 1250 },
        dates,
      ),
    ).toBeNull();
  });

  it('首付必须小于总价；期数越界；首期日必须晚于取得日', () => {
    expect(validateInstallmentInput({ ...baseInput, downPaymentCents: 120_000 }, dates)).toBe(
      '首付必须小于总价',
    );
    expect(validateInstallmentInput({ ...baseInput, periods: 0 }, dates)).toContain('期数');
    expect(validateInstallmentInput({ ...baseInput, periods: MAX_INSTALLMENT_PERIODS + 1 }, dates)).toContain('期数');
    expect(
      validateInstallmentInput(baseInput, { ...dates, firstDueDateKey: '2026-01-05' }),
    ).toBe('首期还款日必须晚于取得日期');
    expect(
      validateInstallmentInput(baseInput, { ...dates, firstDueDateKey: '2026-02-30' }),
    ).toBe('首期还款日格式不正确');
  });

  it('利息/利率非法时拒绝', () => {
    expect(validateInstallmentInput({ ...baseInput, totalInterestCents: -1 }, dates)).toBe(
      '总利息格式不正确',
    );
    expect(
      validateInstallmentInput(
        { ...baseInput, interestMode: 'annual-rate', annualRateScaled: -5 },
        dates,
      ),
    ).toBe('年化利率格式不正确');
  });
});

describe('buildInstallmentPlan', () => {
  it('总利息模式：每期 = round((本金+利息)/期数)，结算利息吸收尾差', () => {
    const plan = buildInstallmentPlan(baseInput, '2026-02-10');
    expect(plan.principalCents).toBe(100_000);
    expect(plan.perPeriodCents).toBe(11_000);
    expect(plan.totalRepayCents).toBe(110_000);
    expect(plan.totalInterestCents).toBe(10_000);
    expect(plan.endDateKey).toBe('2026-11-10');
    expect(plan.anchorDay).toBe(10);
  });

  it('总利息不能整除时以每期×期数为准（尾差几分为负也如实结算）', () => {
    const plan = buildInstallmentPlan(
      { totalCents: 100_000, downPaymentCents: 0, periods: 3, interestMode: 'total', totalInterestCents: 999 },
      '2026-02-10',
    );
    expect(plan.perPeriodCents).toBe(33_666);
    expect(plan.totalRepayCents).toBe(100_998);
    expect(plan.totalInterestCents).toBe(998);
  });

  it('年化利率模式：等额本息公式', () => {
    const plan = buildInstallmentPlan(
      {
        totalCents: 1_200_000,
        downPaymentCents: 0,
        periods: 12,
        interestMode: 'annual-rate',
        annualRateScaled: 1200, // 12%
      },
      '2026-02-10',
    );
    // 月利率 1%，等额本息月供 ≈ 106618.56 → 106619
    expect(plan.perPeriodCents).toBe(106_619);
    expect(plan.totalRepayCents).toBe(1_279_428);
    expect(plan.totalInterestCents).toBe(79_428);
  });

  it('年化利率为 0 时退化为本金均摊', () => {
    const plan = buildInstallmentPlan(
      { totalCents: 120_000, downPaymentCents: 20_000, periods: 10, interestMode: 'annual-rate', annualRateScaled: 0 },
      '2026-02-10',
    );
    expect(plan.perPeriodCents).toBe(10_000);
    expect(plan.totalInterestCents).toBe(0);
  });

  it('期数为 1 时每期即全额', () => {
    const plan = buildInstallmentPlan(
      { totalCents: 50_000, downPaymentCents: 10_000, periods: 1, interestMode: 'total', totalInterestCents: 0 },
      '2026-02-10',
    );
    expect(plan.perPeriodCents).toBe(40_000);
    expect(plan.endDateKey).toBe('2026-02-10');
  });

  it('每期金额过小（不足 1 分）时报错', () => {
    expect(() =>
      buildInstallmentPlan(
        { totalCents: 10, downPaymentCents: 0, periods: 60, interestMode: 'total', totalInterestCents: 0 },
        '2026-02-10',
      ),
    ).toThrow('每期金额过小');
  });

  it('月末对齐：首期 31 号时末期取对应月末', () => {
    const plan = buildInstallmentPlan(
      { totalCents: 90_000, downPaymentCents: 0, periods: 3, interestMode: 'total', totalInterestCents: 0 },
      '2026-01-31',
    );
    expect(plan.endDateKey).toBe('2026-03-31');
    expect(installmentEndDateKey('2026-01-31', 3)).toBe('2026-03-31');
  });
});

describe('buildInstallmentRuleInput', () => {
  it('组装月度支出规则：金额/账户/分类/首末期/自动入账', () => {
    const plan = buildInstallmentPlan(baseInput, '2026-02-10');
    const rule = buildInstallmentRuleInput('手机', plan, {
      accountId: 'acc-1',
      categoryId: 'cat-1',
      autoCreate: true,
    });
    expect(rule).toMatchObject({
      name: '分期：手机',
      type: 'expense',
      amount: 11_000,
      accountId: 'acc-1',
      toAccountId: null,
      categoryId: 'cat-1',
      frequency: 'monthly',
      interval: 1,
      anchor: 10,
      startDate: '2026-02-10',
      endDate: '2026-11-10',
      autoCreate: true,
    });
  });
});

describe('installmentProgress', () => {
  const asset = {
    costCents: 120_000,
    installmentPeriods: 10,
    installmentDownPaymentCents: 20_000,
    installmentInterestCents: 10_000,
    installmentFirstDueDateKey: '2026-02-10',
    installmentClosedDateKey: null as string | null,
  };

  it('按已生成期次计算进度与剩余应还', () => {
    const progress = installmentProgress(asset, 3)!;
    expect(progress).toMatchObject({
      periods: 10,
      paidPeriods: 3,
      remainingPeriods: 7,
      perPeriodCents: 11_000,
      totalRepayCents: 110_000,
      paidCents: 20_000 + 33_000,
      remainingCents: 77_000,
      nextDueDateKey: '2026-05-10',
      settled: false,
    });
  });

  it('已结清：剩余期次与剩余应还归零，无下一期', () => {
    const progress = installmentProgress({ ...asset, installmentClosedDateKey: '2026-05-01' }, 4)!;
    expect(progress.settled).toBe(true);
    expect(progress.remainingPeriods).toBe(0);
    expect(progress.remainingCents).toBe(0);
    expect(progress.nextDueDateKey).toBeNull();
    expect(progress.paidPeriods).toBe(4);
  });

  it('规则缺失时按日期回退推算期数（封顶总期数）', () => {
    expect(installmentProgress(asset, null, '2026-01-05')!.paidPeriods).toBe(0);
    // 首期 2026-02-10：到 03-15 已到期 02-10 与 03-10 两期
    expect(installmentProgress(asset, null, '2026-03-15')!.paidPeriods).toBe(2);
    expect(installmentProgress(asset, null, '2030-01-01')!.paidPeriods).toBe(10);
  });

  it('非分期资产返回 null', () => {
    expect(installmentProgress({ ...asset, installmentPeriods: 0 }, 0)).toBeNull();
  });
});
