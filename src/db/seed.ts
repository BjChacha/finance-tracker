import { and, count, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from './client';
import {
  accounts,
  categories,
  transactions,
  type CategoryType,
  type NewCategory,
} from './schema';
import { newId } from '@/lib/id';
import { getSetting, setSetting } from './settings';
import { TRANSFER_CATEGORY_PRESETS } from './category-presets';

type PresetCategory = { name: string; icon: string; color: string; children?: string[] };

const EXPENSE_PRESETS: PresetCategory[] = [
  { name: '餐饮', icon: '🍜', color: '#F97316', children: ['正餐', '零食饮料', '夜宵'] },
  { name: '交通', icon: '🚌', color: '#3B82F6', children: ['公交地铁', '打车', '加油', '停车'] },
  { name: '购物', icon: '🛒', color: '#EC4899', children: ['日用品', '服饰', '数码'] },
  { name: '居住', icon: '🏠', color: '#8B5CF6', children: ['房租', '水电燃气', '物业'] },
  { name: '娱乐', icon: '🎮', color: '#06B6D4', children: ['电影', '游戏', '旅行'] },
  { name: '医疗', icon: '💊', color: '#EF4444', children: ['药品', '门诊'] },
  { name: '教育', icon: '📚', color: '#10B981', children: ['书籍', '课程'] },
  { name: '通讯', icon: '📱', color: '#6366F1', children: ['话费', '网费'] },
  { name: '人情', icon: '🎁', color: '#F59E0B', children: ['红包', '礼物'] },
  { name: '宠物', icon: '🐱', color: '#84CC16' },
  { name: '运动', icon: '⚽', color: '#14B8A6' },
  { name: '美容', icon: '💄', color: '#F43F5E' },
  { name: '订阅', icon: '📺', color: '#A855F7' },
  { name: '其他支出', icon: '📦', color: '#9CA3AF' },
  { name: '补记漏记', icon: '⚖️', color: '#9CA3AF' },
];

const INCOME_PRESETS: PresetCategory[] = [
  { name: '工资', icon: '💰', color: '#10B981' },
  { name: '奖金', icon: '🏆', color: '#F59E0B' },
  { name: '兼职', icon: '💼', color: '#3B82F6' },
  { name: '理财收益', icon: '📈', color: '#8B5CF6' },
  { name: '红包', icon: '🧧', color: '#EF4444' },
  { name: '退款', icon: '↩️', color: '#06B6D4' },
  { name: '二手闲置', icon: '♻️', color: '#84CC16' },
  { name: '其他收入', icon: '💵', color: '#9CA3AF' },
  { name: '补记漏记', icon: '⚖️', color: '#9CA3AF' },
];

/** 首次启动播种：内置分类 + 默认现金账户。幂等（按分类类型补齐）。 */
export async function seedIfEmpty(): Promise<void> {
  const existingCategoryRows = await db.select({ type: categories.type }).from(categories);
  const existingTypes = new Set(existingCategoryRows.map((row) => row.type));
  const rows: NewCategory[] = [];
  const push = (
    preset: PresetCategory,
    type: CategoryType,
    sortOrder: number,
    stableId?: string,
  ) => {
    const parentId = stableId ?? newId();
    rows.push({
      id: parentId,
      name: preset.name,
      type,
      icon: preset.icon,
      color: preset.color,
      parentId: null,
      sortOrder,
      isPreset: 1,
    });
    preset.children?.forEach((childName, i) => {
      rows.push({
        id: newId(),
        name: childName,
        type,
        icon: preset.icon,
        color: preset.color,
        parentId,
        sortOrder: i,
        isPreset: 1,
      });
    });
  };

  if (!existingTypes.has('expense')) {
    EXPENSE_PRESETS.forEach((p, i) => push(p, 'expense', i));
  }
  if (!existingTypes.has('income')) {
    INCOME_PRESETS.forEach((p, i) => push(p, 'income', i));
  }
  if (!existingTypes.has('transfer')) {
    TRANSFER_CATEGORY_PRESETS.forEach((preset, index) =>
      push(preset, 'transfer', index, preset.id),
    );
  }
  if (rows.length > 0) {
    await db.insert(categories).values(rows);
  }

  const [{ value: accountCount }] = await db.select({ value: count() }).from(accounts);
  if (accountCount === 0) {
    const now = Date.now();
    await db.insert(accounts).values({
      id: newId(),
      name: '现金',
      type: 'cash',
      icon: '💵',
      color: '#10B981',
      initialBalance: 0,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
}

const MEALS_MIGRATION_KEY = 'categories.meals.v1';

/**
 * 一次性迁移：把预置「餐饮」子分类由 早餐/午餐/晚餐/零食饮料 调整为
 * 正餐/零食饮料/夜宵。
 * - 早餐 → 正餐：原地重命名（id 不变，保留历史交易归类）。
 * - 夜宵：作为餐饮新子分类补建（icon/color 沿用餐饮）。
 * - 午餐/晚餐：未被任何交易引用的归档（有交易的保留可见）。
 *
 * 以 settings key 门控只跑一次；逻辑全程幂等，重复执行也安全（找不到餐饮则直接收尾）。
 */
export async function migrateMealCategoriesOnce(): Promise<void> {
  if ((await getSetting<boolean>(MEALS_MIGRATION_KEY)) === true) return;
  try {
    const [canyin] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.name, '餐饮'), eq(categories.type, 'expense'), eq(categories.isPreset, 1)))
      .limit(1);

    if (canyin) {
      // 1) 早餐 → 正餐
      await db
        .update(categories)
        .set({ name: '正餐' })
        .where(
          and(eq(categories.name, '早餐'), eq(categories.parentId, canyin.id), eq(categories.isPreset, 1)),
        );

      // 2) 补建 夜宵（若不存在）
      const [existingYe] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.name, '夜宵'), eq(categories.parentId, canyin.id)))
        .limit(1);
      if (!existingYe) {
        const maxRow = await db
          .select({ m: sql<number>`max(${categories.sortOrder})` })
          .from(categories)
          .where(eq(categories.parentId, canyin.id));
        const nextSort = (maxRow[0]?.m ?? -1) + 1;
        await db.insert(categories).values({
          id: newId(),
          name: '夜宵',
          type: 'expense',
          icon: canyin.icon,
          color: canyin.color,
          parentId: canyin.id,
          sortOrder: nextSort,
          isPreset: 1,
        });
      }

      // 3) 归档无交易引用的 午餐/晚餐（有交易的保留可见）
      const usedRows = await db
        .select({ id: transactions.categoryId })
        .from(transactions)
        .where(isNotNull(transactions.categoryId));
      const usedSet = new Set(usedRows.map((r) => r.id));
      const candidates = await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.parentId, canyin.id),
            eq(categories.isPreset, 1),
            eq(categories.archived, 0),
            inArray(categories.name, ['午餐', '晚餐']),
          ),
        );
      const toArchive = candidates.filter((c) => !usedSet.has(c.id));
      if (toArchive.length > 0) {
        await db
          .update(categories)
          .set({ archived: 1 })
          .where(inArray(categories.id, toArchive.map((c) => c.id)));
      }
    }
  } finally {
    await setSetting(MEALS_MIGRATION_KEY, true);
  }
}
