import type { TransactionType } from '@/db/schema';

/** 规则匹配输入：交易币种金额（分）+ 备注 + 类型 */
export type RuleMatchInput = {
  type: TransactionType;
  amount: number;
  note: string;
};

/** 可参与匹配的规则最小形状（DB 行或其子集） */
export type MatchableRule = {
  enabled: number;
  keyword: string;
  /** 仅匹配该交易类型；null = 不限 */
  matchType: TransactionType | null;
  /** 交易币种金额区间（分，含边界）；null = 不限 */
  amountMin: number | null;
  amountMax: number | null;
};

/** 单条规则是否命中（纯函数）：备注关键词包含（忽略大小写）+ 可选类型/金额过滤 */
export function matchesRule(rule: MatchableRule, input: RuleMatchInput): boolean {
  const keyword = rule.keyword.trim();
  if (!keyword) return false;
  if (!input.note.toLowerCase().includes(keyword.toLowerCase())) return false;
  if (rule.matchType !== null && rule.matchType !== input.type) return false;
  if (rule.amountMin !== null && input.amount < rule.amountMin) return false;
  if (rule.amountMax !== null && input.amount > rule.amountMax) return false;
  return true;
}

/**
 * 按 position 顺序取首条启用的命中规则（确定性优先，先到先得）。
 * 调用方需先按 position 排序（repository.listRules 已排）。
 */
export function matchTransaction<T extends MatchableRule>(
  rules: readonly T[],
  input: RuleMatchInput,
): T | null {
  for (const rule of rules) {
    if (rule.enabled !== 1) continue;
    if (matchesRule(rule, input)) return rule;
  }
  return null;
}

export type RuleValidationError =
  | 'emptyKeyword'
  | 'keywordTooLong'
  | 'invalidAmountRange'
  | 'missingCategory';

/** 规则输入校验（纯函数）：返回错误或 null */
export function validateRuleInput(input: {
  keyword: string;
  categoryId: string | null;
  amountMin: number | null;
  amountMax: number | null;
}): RuleValidationError | null {
  const keyword = input.keyword.trim();
  if (!keyword) return 'emptyKeyword';
  if (Array.from(keyword).length > 20) return 'keywordTooLong';
  if (!input.categoryId) return 'missingCategory';
  if (
    input.amountMin !== null &&
    input.amountMax !== null &&
    input.amountMin > input.amountMax
  ) {
    return 'invalidAmountRange';
  }
  return null;
}

/** 从一笔交易生成规则的默认关键词：备注去首尾空白后截断（最多 20 字） */
export function keywordFromNote(note: string): string {
  const trimmed = note.trim();
  return Array.from(trimmed).slice(0, 20).join('');
}
