import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { categories, type Category } from '@/db/schema';
import { newId } from '@/lib/id';

export type CategoryNode = Category & { children: Category[] };

/** 按类型取未归档分类，组装成两级树 */
export async function listCategoryTree(type: 'expense' | 'income'): Promise<CategoryNode[]> {
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
  type: 'expense' | 'income';
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
