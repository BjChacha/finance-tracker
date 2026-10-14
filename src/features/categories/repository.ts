import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { categories, type Category, type CategoryType } from '@/db/schema';
import { newId } from '@/lib/id';

export type CategoryNode = Category & { children: Category[] };

/** 按类型取未归档分类，组装成两级树 */
export async function listCategoryTree(type: CategoryType): Promise<CategoryNode[]> {
  const rows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.type, type), eq(categories.archived, 0)))
    .orderBy(asc(categories.sortOrder));

  const parents: CategoryNode[] = [];
  const byId = new Map<string, CategoryNode>();
  for (const row of rows) {
    if (row.parentId === null) {
      const node: CategoryNode = { ...row, children: [] };
      parents.push(node);
      byId.set(row.id, node);
    }
  }
  for (const row of rows) {
    if (row.parentId !== null) byId.get(row.parentId)?.children.push(row);
  }
  return parents;
}

export type CategoryInput = {
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  parentId: string | null;
};

export async function createCategory(input: CategoryInput): Promise<string> {
  const id = newId();
  await db.insert(categories).values({
    id,
    name: input.name,
    type: input.type,
    icon: input.icon,
    color: input.color,
    parentId: input.parentId,
    sortOrder: Date.now(),
    isPreset: 0,
  });
  return id;
}

export async function updateCategory(
  id: string,
  input: Pick<CategoryInput, 'name' | 'icon' | 'color'>,
): Promise<void> {
  await db
    .update(categories)
    .set({ name: input.name, icon: input.icon, color: input.color })
    .where(eq(categories.id, id));
}

/** 归档分类（连带归档其子分类） */
export async function archiveCategory(id: string): Promise<void> {
  await db.update(categories).set({ archived: 1 }).where(eq(categories.id, id));
  await db.update(categories).set({ archived: 1 }).where(eq(categories.parentId, id));
}

/** 「补记漏记」分类名（余额调整交易专用，收支两类各一个） */
export const ADJUSTMENT_CATEGORY_NAME = '补记漏记';

/**
 * 取得（不存在则创建）指定类型下的「补记漏记」分类，返回 id。
 * 幂等：按 名称+类型 查找；缺失才插入（isPreset=1）。
 * 兼容已有库（未播种）与恢复旧备份的情形。
 */
export async function ensureAdjustmentCategory(type: 'expense' | 'income'): Promise<string> {
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.name, ADJUSTMENT_CATEGORY_NAME), eq(categories.type, type)))
    .limit(1);
  if (existing) return existing.id;
  const id = newId();
  await db.insert(categories).values({
    id,
    name: ADJUSTMENT_CATEGORY_NAME,
    type,
    icon: '⚖️',
    color: '#9CA3AF',
    parentId: null,
    sortOrder: Date.now(),
    isPreset: 1,
  });
  return id;
}
