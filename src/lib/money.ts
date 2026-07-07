/** 金额工具：一律整数分运算，展示层才转元。绝不经过 float 乘除。 */

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

/** 分 → 带货币符号展示，如 "¥1,234.56" */
export function formatCentsWithSymbol(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}¥${formatCents(Math.abs(cents))}`;
}
