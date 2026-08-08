/** 金额工具：一律整数分运算，展示层才转元。绝不经过 float 乘除。 */

/** 汇率定点小数缩放：rate_scaled = round(rate × RATE_SCALE)；1.0 → 1_000_000 */
export const RATE_SCALE = 1_000_000;

/** 常见币种符号；未命中回退 ¥ */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '￥',
  HKD: 'HK$',
  TWD: 'NT$',
  KRW: '₩',
  SGD: 'S$',
  AUD: 'A$',
  CAD: 'C$',
};

/** 取币种符号，未知/未传 → ¥ */
export function currencySymbol(currency?: string | null): string {
  return (currency && CURRENCY_SYMBOLS[currency.toUpperCase()]) || '¥';
}

/** 原币种分 → 本位币分：round(amountCents × rateScaled / RATE_SCALE) */
export function toBaseCents(amountCents: number, rateScaled: number): number {
  return Math.round((amountCents * rateScaled) / RATE_SCALE);
}

/**
 * 解析汇率字符串为 ×RATE_SCALE 的整数。
 * "6.7606" → 6760600；"" / 非法 / ≤0 → RATE_SCALE（即 1.0，视同本位币）。
 */
export function parseRateToScaled(input: string | undefined | null): number {
  if (input == null) return RATE_SCALE;
  const s = input.replace(/[,，\s]/g, '').trim();
  if (s === '') return RATE_SCALE;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return RATE_SCALE;
  return Math.round(n * RATE_SCALE);
}

/**
 * 解析用户输入/导入的金额字符串为整数分。
 * 支持："12.3"、"1,234.56"、"¥12.00"、"￥12"、"-5.20"、"１２.５"（全角）、"12．5"（全角点）。
 * 超过两位小数四舍五入到分。无法解析返回 null。
 */
export function parseMoneyToCents(input: string): number | null {
  if (typeof input !== 'string') return null;
  // 全角转半角
  let s = input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．]/g, '.')
    .replace(/[，]/g, ',')
    .replace(/[－ー—–]/g, '-')
    .trim();
  // 去货币符号、空白、千分位逗号
  s = s.replace(/[¥￥$€£\s]/g, '').replace(/,/g, '');
  if (s === '' || s === '-' || s === '.') return null;
  const m = /^(-?)(\d*)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const [, sign, intPart, fracPart] = m;
  if (!intPart && !fracPart) return null;
  const whole = intPart ? parseInt(intPart, 10) : 0;
  let cents = whole * 100;
  if (fracPart) {
    // 取前两位；第三位用于四舍五入
    const frac2 = fracPart.slice(0, 2).padEnd(2, '0');
    cents += parseInt(frac2, 10);
    if (fracPart.length > 2 && parseInt(fracPart[2]!, 10) >= 5) cents += 1;
  }
  if (!Number.isSafeInteger(cents)) return null;
  return sign === '-' ? -cents : cents;
}

/** 分 → 元字符串，两位小数，如 123456 → "1,234.56" */
export function formatCents(cents: number, opts?: { sign?: boolean; grouping?: boolean }): string {
  const sign = cents < 0 ? '-' : opts?.sign ? '+' : '';
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const yuanStr =
    opts?.grouping === false ? String(yuan) : String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${yuanStr}.${frac}`;
}

/** 分 → 带货币符号展示，如 "¥1,234.56"；currency 未传或未知时回退 ¥ */
export function formatCentsWithSymbol(cents: number, currency?: string): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}${currencySymbol(currency)}${formatCents(Math.abs(cents))}`;
}

/** 去掉十进制字符串尾部无效 0：'1.200' → '1.2'、'123.0' → '123' */
function trimDecimal(value: string): string {
  const [whole, fraction] = value.split('.');
  if (!fraction) return whole!;
  const compactFraction = fraction.replace(/0+$/, '');
  return compactFraction ? `${whole}.${compactFraction}` : whole!;
}

/** 十进制字符串小数点左移 exponent 位（k=3、M=6、B=9、T=12），纯字符串运算避免浮点噪声 */
function shiftDecimalPoint(abs: number, exponent: number): string {
  const [intPart, fracPart = ''] = String(abs).split('.');
  const digits = intPart + fracPart;
  const pointPos = intPart.length - exponent;
  if (pointPos >= digits.length) return digits + '0'.repeat(pointPos - digits.length);
  if (pointPos <= 0) return `0.${'0'.repeat(-pointPos)}${digits}`;
  return `${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`;
}

/** 按 decimals 位小数四舍五入；若向整数位进位（999.95 → 1000）返回 null，由调用方展示原始值 */
function roundNoCarry(decimal: string, decimals: 0 | 1 | 2): string | null {
  const [intPart, fracPart = ''] = decimal.split('.');
  const frac = (fracPart + '0'.repeat(decimals)).slice(0, decimals);
  const next = Number(fracPart[decimals] ?? '0');
  const fracNum = Number(frac);
  if (next >= 5) {
    if (fracNum + 1 === 10 ** decimals) return null; // 四舍五入进位
    return trimDecimal(`${intPart}.${String(fracNum + 1).padStart(decimals, '0')}`);
  }
  return fracNum === 0
    ? intPart
    : trimDecimal(`${intPart}.${String(fracNum).padStart(decimals, '0')}`);
}

/** 元 → 国际单位紧凑展示（无货币符号）：1234 → "1.2k"、1.2e6 → "1.2M"、1.2e9 → "1.2B"、1.2e12 → "1.2T" */
export function formatCompactYuan(yuan: number): string {
  const sign = yuan < 0 ? '-' : '';
  const abs = Math.abs(yuan);
  const steps: Array<[number, number, string]> = [
    [1e12, 12, 'T'],
    [1e9, 9, 'B'],
    [1e6, 6, 'M'],
    [1e3, 3, 'k'],
  ];
  for (const [base, exponent, suffix] of steps) {
    if (abs >= base) {
      const scaled = shiftDecimalPoint(abs, exponent);
      return `${sign}${roundNoCarry(scaled, 1) ?? trimDecimal(scaled)}${suffix}`;
    }
  }
  const decimal = String(abs);
  if (abs >= 100) {
    // 0 位小数进位（如 123.5 → 124）时退到 1 位小数，仍进位则展示原始值
    return `${sign}${roundNoCarry(decimal, 0) ?? roundNoCarry(decimal, 1) ?? trimDecimal(decimal)}`;
  }
  if (abs >= 10) return `${sign}${roundNoCarry(decimal, 1) ?? trimDecimal(decimal)}`;
  return `${sign}${roundNoCarry(decimal, 2) ?? trimDecimal(decimal)}`;
}

/** Compact amount for dense data labels, without a currency symbol. */
export function formatCompactCents(cents: number): string {
  return formatCompactYuan(cents / 100);
}

/** Keep exact values while they fit a dense label, then switch to a symbol-prefixed compact value. */
export function formatAdaptiveCentsWithSymbol(
  cents: number,
  currency?: string,
  maxExactLength = 10,
): string {
  const exact = formatCentsWithSymbol(cents, currency);
  if (exact.length <= maxExactLength) return exact;

  const compact = formatCompactCents(cents);
  const symbol = currencySymbol(currency);
  return compact.startsWith('-') ? `-${symbol}${compact.slice(1)}` : `${symbol}${compact}`;
}

/** rateToCNY 展示：≥1 两位小数，<1 四位（适配日元/韩元等小汇率）；缺省返回 '—'。 */
export function formatRateToCNY(rate: number | null | undefined): string {
  if (rate == null) return '—';
  return rate >= 1 ? rate.toFixed(2) : rate.toFixed(4);
}
