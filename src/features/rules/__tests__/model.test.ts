import { matchesRule, matchTransaction, validateRuleInput, keywordFromNote } from '../model';

const baseRule = {
  enabled: 1,
  keyword: '美团',
  matchType: null,
  amountMin: null,
  amountMax: null,
};

describe('matchesRule', () => {
  it('备注包含关键词（忽略大小写）命中', () => {
    expect(
      matchesRule({ ...baseRule, keyword: '美团' }, { type: 'expense', amount: 2500, note: '美团外卖 午餐' }),
    ).toBe(true);
    expect(
      matchesRule({ ...baseRule, keyword: 'MEITUAN' }, { type: 'expense', amount: 2500, note: 'meituan 外卖' }),
    ).toBe(true);
  });

  it('关键词不包含不命中；空关键词永不命中', () => {
    expect(
      matchesRule(baseRule, { type: 'expense', amount: 2500, note: '饿了么' }),
    ).toBe(false);
    expect(
      matchesRule({ ...baseRule, keyword: '  ' }, { type: 'expense', amount: 2500, note: '美团' }),
    ).toBe(false);
  });

  it('类型与金额区间过滤（含边界）', () => {
    const rule = { ...baseRule, matchType: 'expense' as const, amountMin: 1000, amountMax: 5000 };
    expect(matchesRule(rule, { type: 'expense', amount: 1000, note: '美团' })).toBe(true);
    expect(matchesRule(rule, { type: 'expense', amount: 5000, note: '美团' })).toBe(true);
    expect(matchesRule(rule, { type: 'expense', amount: 999, note: '美团' })).toBe(false);
    expect(matchesRule(rule, { type: 'income', amount: 2000, note: '美团' })).toBe(false);
  });
});

describe('matchTransaction', () => {
  const rules = [
    { id: 'r1', ...baseRule, keyword: '房租', enabled: 1, position: 0 },
    { id: 'r2', ...baseRule, keyword: '美团', enabled: 1, position: 1 },
    { id: 'r3', ...baseRule, keyword: '话费', enabled: 0, position: 2 },
  ];
  const input = { type: 'expense' as const, amount: 3500, note: '美团 话费充值' };

  it('按 position 顺序取首条命中', () => {
    expect(matchTransaction(rules, input)?.id).toBe('r2');
  });

  it('停用规则跳过', () => {
    const only = [{ id: 'r3', ...baseRule, keyword: '话费', enabled: 0, position: 2 }];
    expect(matchTransaction(only, input)).toBeNull();
  });

  it('无命中返回 null', () => {
    expect(matchTransaction(rules, { type: 'expense', amount: 100, note: '随便' })).toBeNull();
  });
});

describe('validateRuleInput', () => {
  it('通过：仅关键词+分类', () => {
    expect(
      validateRuleInput({ keyword: ' 美团 ', categoryId: 'cat-1', amountMin: null, amountMax: null }),
    ).toBeNull();
  });

  it('空关键词 / 缺分类 / 区间颠倒 分别报错', () => {
    expect(
      validateRuleInput({ keyword: ' ', categoryId: 'cat-1', amountMin: null, amountMax: null }),
    ).toBe('emptyKeyword');
    expect(
      validateRuleInput({ keyword: '美团', categoryId: null, amountMin: null, amountMax: null }),
    ).toBe('missingCategory');
    expect(
      validateRuleInput({ keyword: '美团', categoryId: 'cat-1', amountMin: 5000, amountMax: 1000 }),
    ).toBe('invalidAmountRange');
  });

  it('关键词超 20 字报错（按 Unicode 字符计）', () => {
    expect(
      validateRuleInput({ keyword: '一'.repeat(21), categoryId: 'cat-1', amountMin: null, amountMax: null }),
    ).toBe('keywordTooLong');
    expect(
      validateRuleInput({ keyword: '一'.repeat(20), categoryId: 'cat-1', amountMin: null, amountMax: null }),
    ).toBeNull();
  });
});

describe('keywordFromNote', () => {
  it('去空白并截断到 20 字', () => {
    expect(keywordFromNote('  美团外卖  ')).toBe('美团外卖');
    expect(keywordFromNote('一'.repeat(30))).toHaveLength(20);
  });
});
