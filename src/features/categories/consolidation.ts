import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  categories,
  importMappings,
  transactions,
} from '@/db/schema';
import { getSetting, setSetting } from '@/db/settings';
import { ensureAdjustmentCategory, ADJUSTMENT_CATEGORY_NAME } from './repository';

const CONSOLIDATION_MIGRATION_KEY = 'categories.consolidation.v1';

/** 迁移只涉及收支两类（transfer 分类不在合并范围） */
type AdjustType = 'expense' | 'income';

/** 一次合并：把 from 分类（类型+名称定位）并入 to 分类 */
type MergePair = {
  from: { type: AdjustType; name: string };
  /** ensureAdjustment=true 时 to 走 ensureAdjustmentCategory（收支各一，缺失则补建） */
  to: { type: AdjustType; name: string; ensureAdjustment?: boolean };
};

/**
 * 线上库实际使用的分类与预置分类存在历史重复（自建「漏记支出/漏记收入/网络服务」
 * 与预置「补记漏记/订阅」并存），统一并入预置分类并归档自建项。
 * 目标分类按 名称+类型 定位：收支「补记漏记」全库各至多一个；「订阅」同理。
 */
const DEFAULT_PAIRS: readonly MergePair[] = [
  {
    from: { type: 'expense', name: '漏记支出' },
    to: { type: 'expense', name: ADJUSTMENT_CATEGORY_NAME, ensureAdjustment: true },
  },
  {
    from: { type: 'expense', name: '网络服务' },
    to: { type: 'expense', name: '订阅' },
  },
  {
    from: { type: 'income', name: '漏记收入' },
    to: { type: 'income', name: ADJUSTMENT_CATEGORY_NAME, ensureAdjustment: true },
  },
];

async function findCategoryId(type: AdjustType, name: string): Promise<string | null> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.type, type), eq(categories.name, name), eq(categories.archived, 0)))
    .limit(1);
  return row?.id ?? null;
}

/**
 * 一次性迁移：合并历史重复的支出/收入分类（含存量交易与导入映射的改指向）。
 * - 已迁移（settings key=true）→ 立即返回。
 * - from 不存在 → 跳过该对（幂等：已迁移或从未自建过）。
 * - 归档而非删除被并分类：budgets 等表仍持有引用，归档不破坏外键完整性。
 * 逻辑幂等、逐对独立，任何一步失败可下次启动重试。
 */
export async function migrateCategoryConsolidationOnce(
  pairs: readonly MergePair[] = DEFAULT_PAIRS,
): Promise<void> {
  if ((await getSetting<boolean>(CONSOLIDATION_MIGRATION_KEY)) === true) return;
  try {
    for (const pair of pairs) {
      const fromId = await findCategoryId(pair.from.type, pair.from.name);
      if (!fromId) continue;

      const toId = pair.to.ensureAdjustment
        ? await ensureAdjustmentCategory(pair.to.type)
        : await findCategoryId(pair.to.type, pair.to.name);
      if (!toId || toId === fromId) continue;

      // 1) 存量交易改指向
      await db
        .update(transactions)
        .set({ categoryId: toId })
        .where(eq(transactions.categoryId, fromId));

      // 2) 导入映射改指向；(adapter, kind, sourceLabel) 唯一索引冲突时删旧条目
      const mappings = await db
        .select()
        .from(importMappings)
        .where(
          and(eq(importMappings.kind, 'category'), eq(importMappings.targetId, fromId)),
        );
      for (const mapping of mappings) {
        const [dup] = await db
          .select({ id: importMappings.id })
          .from(importMappings)
          .where(
            and(
              eq(importMappings.adapterId, mapping.adapterId),
              eq(importMappings.kind, mapping.kind),
              eq(importMappings.sourceLabel, mapping.sourceLabel),
              eq(importMappings.targetId, toId),
            ),
          )
          .limit(1);
        if (dup) {
          await db.delete(importMappings).where(eq(importMappings.id, mapping.id));
        } else {
          await db
            .update(importMappings)
            .set({ targetId: toId })
            .where(eq(importMappings.id, mapping.id));
        }
      }

      // 3) 归档被并分类（连带子分类），与 archiveCategory 语义一致
      await db.update(categories).set({ archived: 1 }).where(eq(categories.id, fromId));
      await db.update(categories).set({ archived: 1 }).where(eq(categories.parentId, fromId));
    }
  } finally {
    await setSetting(CONSOLIDATION_MIGRATION_KEY, true);
  }
}
