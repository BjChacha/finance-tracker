import type { IconName } from '@/components/Icon';

/** 分类图标未识别时的兜底 */
export const DEFAULT_CATEGORY_KEY: IconName = 'package';
/** 账户图标未识别时的兜底 */
export const DEFAULT_ACCOUNT_KEY: IconName = 'wallet';

/**
 * 旧版 emoji → Lucide key 映射（种子 + 两个选择器用过的全部 emoji）。
 * 渲染时据此把历史数据里的 emoji 自动转成矢量 key，**无需数据库迁移、不丢数据**。
 */
export const EMOJI_TO_KEY: Record<string, IconName> = {
  '🍜': 'utensils',
  '🚌': 'bus',
  '🛒': 'shopping-cart',
  '🏠': 'house',
  '🎮': 'gamepad-2',
  '💊': 'pill',
  '📚': 'book-open',
  '📱': 'smartphone',
  '🎁': 'gift',
  '🐱': 'cat',
  '⚽': 'trophy',
  '💄': 'brush',
  '📺': 'tv',
  '📦': 'package',
  '💰': 'piggy-bank',
  '🏆': 'trophy',
  '💼': 'briefcase',
  '📈': 'trending-up',
  '🧧': 'gift',
  '↩️': 'rotate-ccw',
  '♻️': 'recycle',
  '💵': 'banknote',
  '🏦': 'landmark',
  '💳': 'credit-card',
  '🪙': 'coins',
  '💎': 'gem',
};

/** 分类选择器图标集（种子的超集，预置分类都能重选） */
export const CATEGORY_ICON_KEYS: IconName[] = [
  'utensils', 'coffee', 'pizza', 'bus', 'car', 'bike', 'plane',
  'shopping-cart', 'shopping-bag', 'house', 'gamepad-2', 'film', 'music', 'tv',
  'pill', 'heart-pulse', 'book-open', 'graduation-cap', 'smartphone', 'wifi',
  'gift', 'party-popper', 'cat', 'dog', 'baby', 'trophy', 'volleyball', 'dices',
  'brush', 'sparkles', 'landmark', 'piggy-bank', 'trending-up', 'wallet', 'briefcase',
  'hand-coins', 'recycle', 'rotate-ccw', 'package', 'arrow-left-right', 'credit-card',
  'banknote',
];

/** 账户选择器图标集 */
export const ACCOUNT_ICON_KEYS: IconName[] = [
  'wallet', 'banknote', 'piggy-bank', 'coins', 'gem',
  'credit-card', 'landmark', 'building-2', 'smartphone', 'gift', 'briefcase', 'vault',
];

const ALL_USER_KEYS = new Set<string>([...CATEGORY_ICON_KEYS, ...ACCOUNT_ICON_KEYS]);

/**
 * 把存储的 icon 值解析成可渲染的 Lucide key。
 * - 已是选择器 key → 原样返回
 * - 命中 emoji 映射 → 返回对应 key（兼容历史数据 / 旧备份）
 * - 否则 → 按 kind 返回兜底（分类 package / 账户 wallet）
 */
export function resolveIconKey(
  stored: string | null | undefined,
  kind: 'category' | 'account',
): IconName {
  if (stored && ALL_USER_KEYS.has(stored)) return stored as IconName;
  const mapped = stored ? EMOJI_TO_KEY[stored] : undefined;
  if (mapped) return mapped;
  return kind === 'account' ? DEFAULT_ACCOUNT_KEY : DEFAULT_CATEGORY_KEY;
}
