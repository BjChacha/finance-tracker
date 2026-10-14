import { toCsvRecord } from '../csv';

describe('transfer CSV output', () => {
  it('reuses the existing category and subcategory columns', () => {
    expect(
      toCsvRecord({
        dateKey: '2026-08-23',
        type: 'transfer',
        amount: 50000,
        fee: 100,
        note: 'statement',
        categoryName: '信用卡',
        categoryParentName: '账单还款',
        accountName: 'Bank',
        toAccountName: 'Card',
      }),
    ).toEqual({
      日期: '2026-08-23',
      类型: '转账',
      '金额(元)': '500.00',
      分类: '账单还款',
      子分类: '信用卡',
      账户: 'Bank',
      转入账户: 'Card',
      '手续费(元)': '1.00',
      备注: 'statement',
    });
  });
});
