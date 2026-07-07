import { count } from 'drizzle-orm';
import { db } from './client';
import { accounts, categories, type NewCategory } from './schema';
import { newId } from '@/lib/id';

type PresetCategory = { name: string; icon: string; color: string; children?: string[] };

const EXPENSE_PRESETS: PresetCategory[] = [
  { name: '餐饮', icon: '🍜', color: '#F97316', children: ['早餐', '午餐', '晚餐', '零食饮料'] },
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
];

/** 首次启动播种：内置分类 + 默认现金账户。幂等（有数据则跳过）。 */
export async function seedIfEmpty(): Promise<void> {
  const [{ value: categoryCount }] = await db.select({ value: count() }).from(categories);
  if (categoryCount === 0) {
    const rows: NewCategory[] = [];
    const push = (preset: PresetCategory, type: 'expense' | 'income', sortOrder: number) => {
      const parentId = newId();
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
    EXPENSE_PRESETS.forEach((p, i) => push(p, 'expense', i));
    INCOME_PRESETS.forEach((p, i) => push(p, 'income', i));
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
