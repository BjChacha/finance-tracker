// Pure-function tests: stub the db client so importing repository does not
// initialise expo-sqlite (unavailable under jest/node).
jest.mock('@/db/client', () => ({ db: {} }));

import { filterIncomeByKeyword, validateAssetInput, type AssetInput } from '../repository';

describe('filterIncomeByKeyword', () => {
  const rows = [
    {
      note: '卖掉旧手机',
      categoryName: '二手闲置',
      parentCategoryName: null,
      accountName: '现金',
    },
    {
      note: null as string | null,
      categoryName: '工资',
      parentCategoryName: null,
      accountName: '中行工资卡',
    },
    {
      note: '年终奖',
      categoryName: '奖金',
      parentCategoryName: '工作',
      accountName: '招行卡',
    },
  ];

  it('空关键词返回全部（浅拷贝）', () => {
    expect(filterIncomeByKeyword(rows, '')).toEqual(rows);
    expect(filterIncomeByKeyword(rows, '   ')).toEqual(rows);
  });

  it('命中备注 / 分类 / 父分类 / 账户名（大小写与首尾空白不敏感）', () => {
    expect(filterIncomeByKeyword(rows, '手机')).toHaveLength(1);
    expect(filterIncomeByKeyword(rows, '工资')).toHaveLength(1); // 分类「工资」
    expect(filterIncomeByKeyword(rows, '工作')).toHaveLength(1); // 父分类
    expect(filterIncomeByKeyword(rows, '招行卡')).toHaveLength(1); // 账户
    expect(filterIncomeByKeyword(rows, ' 奖金 ')).toHaveLength(1);
  });

  it('无命中返回空数组', () => {
    expect(filterIncomeByKeyword(rows, '不存在')).toEqual([]);
  });
});

function baseInput(partial: Partial<AssetInput> = {}): AssetInput {
  return {
    name: 'iPhone 17 Pro',
    category: 'electronics',
    quantity: 1,
    costCents: 899900,
    currentValueCents: 899900,
    acquiredDateKey: '2026-09-19',
    note: '',
    sourceTransactionId: null,
    ...partial,
  };
}

describe('validateAssetInput', () => {
  it('合法输入通过（成本 0 的赠予资产也允许）', () => {
    expect(validateAssetInput(baseInput())).toBeNull();
    expect(validateAssetInput(baseInput({ costCents: 0, currentValueCents: 0 }))).toBeNull();
  });

  it('名称必填（纯空白视为空）', () => {
    expect(validateAssetInput(baseInput({ name: '   ' }))).toBe('请输入资产名称');
  });

  it('类别必须是预设 key', () => {
    expect(validateAssetInput(baseInput({ category: 'gadgets' }))).toBe('请选择资产类别');
  });

  it('数量必须为 ≥1 的整数', () => {
    expect(validateAssetInput(baseInput({ quantity: 0 }))).toBe('数量必须为不小于 1 的整数');
    expect(validateAssetInput(baseInput({ quantity: 1.5 }))).toBe('数量必须为不小于 1 的整数');
    expect(validateAssetInput(baseInput({ quantity: -2 }))).toBe('数量必须为不小于 1 的整数');
  });

  it('成本/估值为负数时拒绝', () => {
    expect(validateAssetInput(baseInput({ costCents: -1 }))).toBe('取得成本格式不正确');
    expect(validateAssetInput(baseInput({ currentValueCents: -100 }))).toBe('当前估值格式不正确');
  });

  it('取得日期必须是合法的 YYYY-MM-DD', () => {
    expect(validateAssetInput(baseInput({ acquiredDateKey: '2026/09/19' }))).toBe(
      '取得日期格式不正确（YYYY-MM-DD）',
    );
    expect(validateAssetInput(baseInput({ acquiredDateKey: '2026-02-30' }))).toBe(
      '取得日期格式不正确（YYYY-MM-DD）',
    );
  });
});
