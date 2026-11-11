import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  categorizationRules,
  categories,
  type CategorizationRule,
} from '@/db/schema';
import { newId } from '@/lib/id';
import { validateRuleInput } from './model';

export type RuleListItem = CategorizationRule & {
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
};

export type RuleInput = {
  /** 更新时传入 */
  id?: string;
  name: string;
  keyword: string;
  matchType: import('@/db/schema').TransactionType | null;
  amountMin: number | null;
  amountMax: number | null;
  categoryId: string;
};

/** 全部规则（含停用），position 升序、再按创建时间 */
export async function listRules(): Promise<RuleListItem[]> {
  return db
    .select({
      id: categorizationRules.id,
      name: categorizationRules.name,
      enabled: categorizationRules.enabled,
      position: categorizationRules.position,
      keyword: categorizationRules.keyword,
      matchType: categorizationRules.matchType,
      amountMin: categorizationRules.amountMin,
      amountMax: categorizationRules.amountMax,
      categoryId: categorizationRules.categoryId,
      matchCount: categorizationRules.matchCount,
      lastMatchedAt: categorizationRules.lastMatchedAt,
      createdAt: categorizationRules.createdAt,
      updatedAt: categorizationRules.updatedAt,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
    })
    .from(categorizationRules)
    .innerJoin(categories, eq(categorizationRules.categoryId, categories.id))
    .orderBy(asc(categorizationRules.position), asc(categorizationRules.createdAt));
}

/** 新建或更新规则；校验失败抛错（中文消息供 UI 直接展示）。新建排到末位。 */
export async function upsertRule(input: RuleInput): Promise<string> {
  const error = validateRuleInput(input);
  if (error) {
    const message = {
      emptyKeyword: '请填写备注关键词',
      keywordTooLong: '关键词最多 20 个字',
      invalidAmountRange: '金额区间下限不能大于上限',
      missingCategory: '请选择目标分类',
    }[error];
    throw new Error(message);
  }
  const now = Date.now();
  const keyword = input.keyword.trim();
  const name = input.name.trim() || keyword;
  if (input.id) {
    await db
      .update(categorizationRules)
      .set({
        name,
        keyword,
        matchType: input.matchType,
        amountMin: input.amountMin,
        amountMax: input.amountMax,
        categoryId: input.categoryId,
        updatedAt: now,
      })
      .where(eq(categorizationRules.id, input.id));
    return input.id;
  }
  const [row] = await db
    .select({ max: sql<number>`COALESCE(MAX(${categorizationRules.position}), -1)`.mapWith(Number) })
    .from(categorizationRules);
  const id = newId();
  await db.insert(categorizationRules).values({
    id,
    name,
    enabled: 1,
    position: (row?.max ?? -1) + 1,
    keyword,
    matchType: input.matchType,
    amountMin: input.amountMin,
    amountMax: input.amountMax,
    categoryId: input.categoryId,
    matchCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function removeRule(id: string): Promise<void> {
  await db.delete(categorizationRules).where(eq(categorizationRules.id, id));
}

export async function setRuleEnabled(id: string, enabled: boolean): Promise<void> {
  await db
    .update(categorizationRules)
    .set({ enabled: enabled ? 1 : 0, updatedAt: Date.now() })
    .where(eq(categorizationRules.id, id));
}

/** 一次保存命中该规则：计数 +1、刷新最近命中时间（用于规则列表展示与后续调参） */
export async function touchRuleMatch(id: string): Promise<void> {
  await db
    .update(categorizationRules)
    .set({
      matchCount: sql`${categorizationRules.matchCount} + 1`,
      lastMatchedAt: Date.now(),
    })
    .where(eq(categorizationRules.id, id));
}

/** 分类被删除前检查是否有规则引用（分类本身是软删除，这里只做展示层提示用） */
export async function countRulesForCategory(categoryId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(categorizationRules)
    .where(and(eq(categorizationRules.categoryId, categoryId)));
  return row?.count ?? 0;
}
