import { parseMoneyToCents } from './money';

/**
 * 金额表达式小工具：支持 + - × ÷ 的简易计算器，供记账金额键盘使用。
 * 与 money.ts 同一约定：一律整数分运算，乘除在单步收尾四舍五入到分。
 */

const OPS = ['+', '-', '×', '÷'] as const;
type Op = (typeof OPS)[number];

function isOp(ch: string): ch is Op {
  return (OPS as readonly string[]).includes(ch);
}

/** 表达式中是否存在待计算的运算符（首位负号不算） */
export function hasPendingOp(expr: string): boolean {
  return expr
    .slice(1)
    .split('')
    .some((ch) => isOp(ch));
}

/** 当前正在输入的操作数（最后一个运算符之后的片段） */
function lastSegment(expr: string): string {
  for (let i = expr.length - 1; i > 0; i--) {
    if (isOp(expr[i]!)) return expr.slice(i + 1);
  }
  return expr;
}

/**
 * 键盘输入状态机：digit / '.' / 运算符 / '⌫'。
 * 规则：每段至多 1 个小数点、2 位小数；连按运算符替换前一个；
 * 空表达式不接受运算符；段尾是 '.' 时按运算符先去掉尾点。
 */
export function appendCalcKey(expr: string, key: string): string {
  if (key === '⌫') return expr.slice(0, -1);

  if (isOp(key)) {
    if (expr === '' || expr === '-') return expr;
    if (expr.endsWith('.')) return expr.slice(0, -1) + key;
    if (isOp(expr[expr.length - 1]!)) return expr.slice(0, -1) + key;
    return expr + key;
  }

  const seg = lastSegment(expr);
  if (key === '.') {
    if (seg.includes('.')) return expr;
    // 空段（表达式开头或运算符之后）补前导 0
    return seg === '' || seg === '-' ? `${expr}0.` : `${expr}.`;
  }

  if (/^\d$/.test(key)) {
    const dot = seg.indexOf('.');
    if (dot >= 0 && seg.length - dot - 1 >= 2) return expr; // 已有两位小数
    return expr + key;
  }

  return expr;
}

type Token = { kind: 'num'; cents: number } | { kind: 'op'; op: Op };

/** 词法：首 token 允许负号（来自上一次求值折叠的负数结果） */
function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i]!;
    if (isOp(ch) && !(i === 0 && ch === '-')) {
      tokens.push({ kind: 'op', op: ch });
      i++;
      continue;
    }
    // 操作数：可选负号（仅开头）+ 数字/小数点
    let j = i === 0 && ch === '-' ? i + 1 : i;
    while (j < expr.length && /[\d.]/.test(expr[j]!)) j++;
    const raw = expr.slice(i, j);
    if (j === i || raw === '-') return null;
    const cents = parseMoneyToCents(raw);
    if (cents === null) return null;
    tokens.push({ kind: 'num', cents });
    i = j;
  }
  return tokens;
}

/**
 * 求值表达式 → 整数分；乘除优先于加减。
 * 尾悬运算符忽略；除 0、非法表达式、超出安全整数返回 null。
 */
export function evalMoneyExpr(expr: string): number | null {
  let s = expr.trim();
  if (s.endsWith('.')) s = s.slice(0, -1);
  while (s !== '' && isOp(s[s.length - 1]!) && s.length > 1) s = s.slice(0, -1);
  if (s === '' || s === '-') return null;

  const tokens = tokenize(s);
  if (!tokens || tokens.length === 0) return null;
  // 结构校验：num (op num)*
  if (tokens.length % 2 === 0) return null;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]!.kind !== (i % 2 === 0 ? 'num' : 'op')) return null;
  }

  // 第一遍：乘除
  const flat: (number | Op)[] = [];
  let acc = (tokens[0] as { cents: number }).cents;
  for (let i = 1; i < tokens.length; i += 2) {
    const op = (tokens[i] as { op: Op }).op;
    const b = (tokens[i + 1] as { cents: number }).cents;
    if (op === '×') {
      acc = Math.round((acc * b) / 100);
    } else if (op === '÷') {
      if (b === 0) return null;
      acc = Math.round((acc * 100) / b);
    } else {
      flat.push(acc, op);
      acc = b;
      continue;
    }
    if (!Number.isSafeInteger(acc)) return null;
  }
  flat.push(acc);

  // 第二遍：加减
  let result = flat[0] as number;
  for (let i = 1; i < flat.length; i += 2) {
    const b = flat[i + 1] as number;
    result = flat[i] === '+' ? result + b : result - b;
    if (!Number.isSafeInteger(result)) return null;
  }
  return result;
}
