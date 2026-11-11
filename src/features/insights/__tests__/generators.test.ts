import type { BudgetStatusItem, BudgetStatus } from '@/features/budgets/repository';
import {
  budgetRiskDrafts,
  monthlyEquivalentCents,
  savingsRateDrafts,
  spendingAnomalyDraft,
  subscriptionAuditDrafts,
  upcomingRecurringDraft,
  type RuleLike,
} from '../generators';

function budgetItem(overrides: Partial<BudgetStatusItem>): BudgetStatusItem {
  return {
    budgetId: 'b1',
    period: 'month',
    categoryId: null,
    name: '总预算',
    icon: null,
    color: null,
    amount: 100000,
    alertPct: 80,
    spent: 0,
    remaining: 100000,
    pct: 0,
    daily: 0,
    level: 'ok',
    ...overrides,
  };
}

describe('budgetRiskDrafts', () => {
  const status = (total: BudgetStatusItem | null, categories: BudgetStatusItem[] = []): Pick<BudgetStatus, 'total' | 'categories'> =>
    ({ total, categories });

  it('总预算 warn → 一条 tier=1', () => {
    const drafts = budgetRiskDrafts(
      status(budgetItem({ level: 'warn', pct: 85, remaining: 15000 })),
      '2026-11',
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.tier).toBe(1);
    expect(drafts[0]!.dedupKey).toBe('budget_risk:2026-11:b1');
    expect(drafts[0]!.actionRoute).toBe('/budgets');
  });

  it('总预算 over → tier=2（比 warn 高，acknowledged 后可复活）', () => {
    const drafts = budgetRiskDrafts(
      status(budgetItem({ level: 'over', pct: 120, remaining: -20000 })),
      '2026-11',
    );
    expect(drafts[0]!.tier).toBe(2);
  });

  it('无总预算时取最严重的分类预算', () => {
    const drafts = budgetRiskDrafts(
      status(null, [
        budgetItem({ budgetId: 'c1', name: '餐饮', level: 'warn', pct: 82 }),
        budgetItem({ budgetId: 'c2', name: '购物', level: 'over', pct: 130, remaining: -3000 }),
      ]),
      '2026-11',
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.dedupKey).toContain('c2');
  });

  it('全部 normal → 无候选', () => {
    expect(
      budgetRiskDrafts(status(budgetItem({ level: 'ok' })), '2026-11'),
    ).toHaveLength(0);
  });
});

describe('spendingAnomalyDraft', () => {
  const top = { id: 'tx-1', note: '机票', amountBaseCents: 300000, categoryId: 'cat-travel' };

  it('样本 ≥5 且 ≥3×中位数 → 命中', () => {
    const drafts = spendingAnomalyDraft(
      { top, samples: [10000, 10000, 11000, 9000, 10000] },
      '2026-11',
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.body).toContain('30 倍');
  });

  it('样本不足 5 个不评估', () => {
    expect(
      spendingAnomalyDraft({ top, samples: [10000, 10000] }, '2026-11'),
    ).toHaveLength(0);
  });

  it('低于 3×中位数不触发', () => {
    expect(
      spendingAnomalyDraft({ top: { ...top, amountBaseCents: 25000 }, samples: [10000, 10000, 11000, 9000, 10000] }, '2026-11'),
    ).toHaveLength(0);
  });

  it('无分类不触发', () => {
    expect(
      spendingAnomalyDraft({ top: { ...top, categoryId: null }, samples: [1, 2, 3, 4, 5] }, '2026-11'),
    ).toHaveLength(0);
  });
});

describe('monthlyEquivalentCents', () => {
  const rule = (over: Partial<RuleLike>): RuleLike =>
    ({ id: 'r', name: 'x', amount: 3000, frequency: 'monthly', interval: 1, type: 'expense', enabled: 1, autoCreate: 1, ...over });

  it('月付=原额；年付=÷12；周付=×52/12；日付=×30', () => {
    expect(monthlyEquivalentCents(rule({}))).toBe(3000);
    expect(monthlyEquivalentCents(rule({ frequency: 'yearly' }))).toBe(250);
    expect(monthlyEquivalentCents(rule({ frequency: 'weekly' }))).toBe(13000);
    expect(monthlyEquivalentCents(rule({ frequency: 'daily' }))).toBe(90000);
  });

  it('interval 参与折算', () => {
    expect(monthlyEquivalentCents(rule({ interval: 2 }))).toBe(1500);
    expect(monthlyEquivalentCents(rule({ frequency: 'yearly', interval: 2 }))).toBe(125);
  });
});

describe('subscriptionAuditDrafts', () => {
  const rules: RuleLike[] = [
    { id: 'r1', name: '视频会员', amount: 2500, frequency: 'monthly', interval: 1, type: 'expense', enabled: 1, autoCreate: 1 },
    { id: 'r2', name: '网盘', amount: 1800, frequency: 'monthly', interval: 1, type: 'expense', enabled: 1, autoCreate: 1 },
    { id: 'r3', name: '已停用', amount: 9900, frequency: 'monthly', interval: 1, type: 'expense', enabled: 0, autoCreate: 1 },
    { id: 'r4', name: '收入类不算', amount: 50000, frequency: 'monthly', interval: 1, type: 'income', enabled: 1, autoCreate: 1 },
  ];

  it('≥2 项启用支出规则 → 月度合计盘点', () => {
    const drafts = subscriptionAuditDrafts(rules, '2026-11');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.dedupKey).toBe('subscription_audit:2026-11');
    expect(drafts[0]!.data.monthlyCents).toBe(4300);
    expect(drafts[0]!.data.count).toBe(2);
  });

  it('不足 2 项不盘点（避免单规则刷屏）', () => {
    expect(subscriptionAuditDrafts(rules.slice(0, 1), '2026-11')).toHaveLength(0);
  });
});

describe('savingsRateDrafts', () => {
  it('偏差 ≥10pp 触发并区分方向', () => {
    const drafts = savingsRateDrafts(
      {
        current: { income: 10000, expense: 4000 },
        trailing: [
          { income: 10000, expense: 6000 },
          { income: 10000, expense: 6500 },
          { income: 10000, expense: 5500 },
        ],
      },
      '2026-11',
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.dedupKey).toBe('savings_rate_change:2026-11:up');
  });

  it('本月无收入不评估；历史不足 2 个有效月不评估', () => {
    expect(
      savingsRateDrafts(
        { current: { income: 0, expense: 100 }, trailing: [{ income: 100, expense: 10 }] },
        '2026-11',
      ),
    ).toHaveLength(0);
    expect(
      savingsRateDrafts(
        { current: { income: 10000, expense: 1000 }, trailing: [{ income: 10000, expense: 9000 }] },
        '2026-11',
      ),
    ).toHaveLength(0);
  });

  it('偏差 <10pp 不触发', () => {
    expect(
      savingsRateDrafts(
        {
          current: { income: 10000, expense: 5000 },
          trailing: [
            { income: 10000, expense: 5500 },
            { income: 10000, expense: 5400 },
          ],
        },
        '2026-11',
      ),
    ).toHaveLength(0);
  });
});

describe('upcomingRecurringDraft', () => {
  const rules = [
    { id: 'r1', name: '房租', amount: 300000, frequency: 'monthly' as const, interval: 1, type: 'expense' as const, enabled: 1, autoCreate: 1, nextRunDate: '2026-11-12' },
    { id: 'r2', name: '会员', amount: 2500, frequency: 'monthly' as const, interval: 1, type: 'expense' as const, enabled: 1, autoCreate: 0, nextRunDate: '2026-11-13' },
    { id: 'r3', name: '太远', amount: 9900, frequency: 'monthly' as const, interval: 1, type: 'expense' as const, enabled: 1, autoCreate: 1, nextRunDate: '2026-11-30' },
  ];

  it('未来 3 天内的规则合并为一条，标注待确认数', () => {
    const drafts = upcomingRecurringDraft({ todayKey: '2026-11-11', rules });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.data.count).toBe(2);
    expect(drafts[0]!.data.totalCents).toBe(302500);
    expect(drafts[0]!.data.needConfirm).toBe(1);
  });

  it('无 3 天内规则 → 无候选；dedupKey 跟随日期集合', () => {
    expect(
      upcomingRecurringDraft({ todayKey: '2026-11-11', rules: [rules[2]!] }),
    ).toHaveLength(0);
    const a = upcomingRecurringDraft({ todayKey: '2026-11-11', rules: [rules[0]!] });
    expect(a[0]!.dedupKey).toBe('upcoming_recurring:2026-11-12');
  });
});
