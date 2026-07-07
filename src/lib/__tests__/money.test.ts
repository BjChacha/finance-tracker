import { formatCents, formatCentsWithSymbol, parseMoneyToCents } from '../money';

describe('parseMoneyToCents', () => {
  it.each([
    ['12.3', 1230],
    ['12.34', 1234],
    ['0.01', 1],
    ['100', 10000],
    ['1,234.56', 123456],
    ['¥12.00', 1200],
    ['￥ 12', 1200],
    ['-5.20', -520],
    ['$99.99', 9999],
    ['12.345', 1235], // 第三位四舍五入
    ['12.344', 1234],
    ['１２.５', 1250], // 全角数字
    ['12．5', 1250], // 全角小数点
    ['1，234.5', 123450], // 全角逗号千分位
    ['−3.00', null], // 数学负号（U+2212）不支持 → 期望见下
  ] as const)('parses %s', (input, expected) => {
    if (input === '−3.00') {
      // U+2212 未列入替换表，允许 null 或 -300 二选一：固定为 null 行为
      expect(parseMoneyToCents(input)).toBeNull();
    } else {
      expect(parseMoneyToCents(input)).toBe(expected);
    }
  });

  it.each(['', '  ', 'abc', '1.2.3', '--5', '.', '-', '¥'])('rejects %s', (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });

  it('never goes through float math', () => {
    // 0.29 * 100 = 28.999999999999996 的经典浮点坑
    expect(parseMoneyToCents('0.29')).toBe(29);
    expect(parseMoneyToCents('19.99')).toBe(1999);
  });
});

describe('formatCents', () => {
  it.each([
    [0, '0.00'],
    [1, '0.01'],
    [1230, '12.30'],
    [123456, '1,234.56'],
    [-520, '-5.20'],
    [100000000, '1,000,000.00'],
  ] as const)('formats %d as %s', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });

  it('supports plus sign and no grouping', () => {
    expect(formatCents(1230, { sign: true })).toBe('+12.30');
    expect(formatCents(123456, { grouping: false })).toBe('1234.56');
  });
});

describe('formatCentsWithSymbol', () => {
  it('places sign before symbol', () => {
    expect(formatCentsWithSymbol(123456)).toBe('¥1,234.56');
    expect(formatCentsWithSymbol(-520)).toBe('-¥5.20');
  });
});
