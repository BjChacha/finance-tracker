import {
  formatCents,
  formatAdaptiveCentsWithSymbol,
  formatCentsWithSymbol,
  formatCompactCents,
  parseMoneyToCents,
  parseRateToScaled,
  toBaseCents,
} from '../money';

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

  it('按币种取符号，未知币种回退 ¥', () => {
    expect(formatCentsWithSymbol(1999, 'USD')).toBe('$19.99');
    expect(formatCentsWithSymbol(1999, 'usd')).toBe('$19.99');
    expect(formatCentsWithSymbol(1999, 'JPY')).toBe('￥19.99');
    expect(formatCentsWithSymbol(1999, 'XYZ')).toBe('¥19.99');
    expect(formatCentsWithSymbol(-1999, 'USD')).toBe('-$19.99');
  });
});

describe('formatCompactCents', () => {
  it.each([
    [0, '0'],
    [99, '0.99'],
    [1234, '12.3'],
    [12345, '123'],
    [123456, '1.2k'],
    [1234567, '12.3k'],
    [99995000, '999.95k'], // 不允许四舍五入进位：999.95k 而非 1M
    [123456789, '1.2M'],
    [12345678900, '123.5M'],
    [9999999999, '99.99999999M'], // 不允许进位：99.99999999M 而非 100M
    [1234567890123, '12.3B'],
    [1234567890123456, '12.3T'],
    [-1234567, '-12.3k'],
  ] as const)('formats %d as %s', (cents, expected) => {
    expect(formatCompactCents(cents)).toBe(expected);
  });

  it.each([
    [12350, '123.5'], // 123.5 元不显示 124
    [99950, '999.5'], // 999.5 元不显示 1000
  ] as const)('子千元范围也不允许进位（%d → %s）', (cents, expected) => {
    expect(formatCompactCents(cents)).toBe(expected);
  });
});

describe('formatAdaptiveCentsWithSymbol', () => {
  it('keeps exact values through the configured threshold', () => {
    expect(formatAdaptiveCentsWithSymbol(9_999_999)).toBe('¥99,999.99');
  });

  it('compacts long, negative, and maximum safe integer amounts', () => {
    expect(formatAdaptiveCentsWithSymbol(99_999_999)).toBe('¥999.99999k');
    expect(formatAdaptiveCentsWithSymbol(-99_999_999, 'USD')).toBe('-$999.99999k');
    expect(formatAdaptiveCentsWithSymbol(Number.MAX_SAFE_INTEGER)).toBe('¥90.1T');
  });
});

describe('parseRateToScaled', () => {
  it('汇率 ×1e6 取整', () => {
    expect(parseRateToScaled('6.7606')).toBe(6_760_600);
    expect(parseRateToScaled('0.0448')).toBe(44_800);
    expect(parseRateToScaled('1')).toBe(1_000_000);
    expect(parseRateToScaled('6,760.6')).toBe(6_760_600_000); // 去千分位后 6760.6
  });

  it.each([undefined, null, '', '  ', 'abc', '0', '-1'])('非法/空 → 1.0（%s）', (input) => {
    expect(parseRateToScaled(input as string | undefined | null)).toBe(1_000_000);
  });
});

describe('toBaseCents', () => {
  it('原币种分 × 汇率(缩放) / 1e6 四舍五入', () => {
    // USD 19.99 @ 6.7606 → 1999 × 6760600 / 1e6 = 13514.44 → 13514
    expect(toBaseCents(1999, 6_760_600)).toBe(13514);
    // 本位币：汇率 1.0
    expect(toBaseCents(12345, 1_000_000)).toBe(12345);
    // JPY 650 @ 0.0448 → 65000 × 44800 / 1e6 = 2912 → 2912
    expect(toBaseCents(65000, 44_800)).toBe(2912);
  });
});
