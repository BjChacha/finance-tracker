import type { IconName } from '@/components/Icon';
import type { AssetStatus } from '@/db/schema';

/**
 * 个人资产类别预设（两级：大类 + 内置二级）。
 * 资产存 key 文本（大类 key 或二级叶子 key），展示层经 resolveAssetCategory 兜底，
 * 后续调整预设不丢历史数据。配色取自应用常用数据色池，图表中可区分。
 * 二级叶子 key 全局唯一；叶子继承父类颜色，图标用自身定义。
 */
export type AssetSubcategoryDefinition = {
  key: string;
  label: string;
  icon: IconName;
};

export type AssetCategoryDefinition = {
  key: string;
  label: string;
  icon: IconName;
  color: string;
  children: readonly AssetSubcategoryDefinition[];
};

export const ASSET_CATEGORY_DEFINITIONS: readonly AssetCategoryDefinition[] = [
  {
    key: 'electronics',
    label: '电子数码',
    icon: 'smartphone',
    color: '#3B82F6',
    children: [
      { key: 'phone', label: '手机', icon: 'smartphone' },
      { key: 'tablet', label: '平板', icon: 'tablet' },
      { key: 'laptop', label: '笔记本电脑', icon: 'laptop' },
      { key: 'headphones', label: '耳机', icon: 'headphones' },
      { key: 'camera', label: '相机', icon: 'camera' },
      { key: 'console', label: '游戏机', icon: 'gamepad-2' },
      { key: 'monitor', label: '显示器', icon: 'monitor' },
      { key: 'wearable', label: '穿戴设备', icon: 'watch' },
      { key: 'keyboard', label: '键鼠外设', icon: 'keyboard' },
    ],
  },
  {
    key: 'appliance',
    label: '家电设备',
    icon: 'tv',
    color: '#06B6D4',
    children: [
      { key: 'kitchen-appliance', label: '厨房电器', icon: 'microwave' },
      { key: 'living-appliance', label: '生活电器', icon: 'tv' },
      { key: 'cleaning-appliance', label: '清洁电器', icon: 'washing-machine' },
      { key: 'cooling-appliance', label: '制冷设备', icon: 'refrigerator' },
    ],
  },
  {
    key: 'home',
    label: '家居家具',
    icon: 'house',
    color: '#F59E0B',
    children: [
      { key: 'furniture', label: '桌椅家具', icon: 'sofa' },
      { key: 'bedding', label: '床垫床品', icon: 'bed' },
      { key: 'storage', label: '收纳置物', icon: 'package' },
      { key: 'kitchenware', label: '厨具餐具', icon: 'utensils' },
    ],
  },
  {
    key: 'vehicle',
    label: '车辆出行',
    icon: 'car',
    color: '#EF4444',
    children: [
      { key: 'car-item', label: '汽车', icon: 'car' },
      { key: 'ebike', label: '电动车', icon: 'bike' },
      { key: 'bicycle', label: '自行车', icon: 'bike' },
      { key: 'travel-gear', label: '出行配件', icon: 'briefcase' },
    ],
  },
  {
    key: 'clothing',
    label: '服饰箱包',
    icon: 'shopping-bag',
    color: '#EC4899',
    children: [
      { key: 'apparel', label: '服饰', icon: 'shopping-bag' },
      { key: 'shoes', label: '鞋靴', icon: 'footprints' },
      { key: 'bags', label: '箱包', icon: 'briefcase' },
      { key: 'accessories', label: '配饰', icon: 'gem' },
    ],
  },
  {
    key: 'jewelry',
    label: '珠宝首饰',
    icon: 'gem',
    color: '#8B5CF6',
    children: [
      { key: 'ornament', label: '首饰', icon: 'gem' },
      { key: 'luxury-watch', label: '手表', icon: 'watch' },
      { key: 'precious-metal', label: '贵金属', icon: 'coins' },
    ],
  },
  {
    key: 'sports',
    label: '运动器材',
    icon: 'volleyball',
    color: '#10B981',
    children: [
      { key: 'ball-sports', label: '球类', icon: 'volleyball' },
      { key: 'fitness', label: '健身器材', icon: 'dumbbell' },
      { key: 'outdoor', label: '户外装备', icon: 'target' },
    ],
  },
  {
    key: 'books',
    label: '图书影音',
    icon: 'book-open',
    color: '#F97316',
    children: [
      { key: 'books-item', label: '图书', icon: 'book-open' },
      { key: 'media-item', label: '影音', icon: 'film' },
      { key: 'instrument-item', label: '乐器', icon: 'music' },
    ],
  },
  {
    key: 'music',
    label: '乐器音乐',
    icon: 'music',
    color: '#14B8A6',
    children: [
      { key: 'instrument', label: '乐器', icon: 'music' },
      { key: 'audio-gear', label: '音频设备', icon: 'headphones' },
    ],
  },
  {
    key: 'digital',
    label: '虚拟资产',
    icon: 'sparkles',
    color: '#A855F7',
    children: [
      { key: 'account-membership', label: '账号会员', icon: 'wifi' },
      { key: 'game-item', label: '游戏道具', icon: 'dices' },
      { key: 'digital-asset', label: '数字资产', icon: 'sparkles' },
    ],
  },
  {
    key: 'subscription',
    label: '订阅服务',
    icon: 'repeat',
    color: '#0EA5E9',
    children: [
      { key: 'media-subscription', label: '影音订阅', icon: 'film' },
      { key: 'software-subscription', label: '软件订阅', icon: 'file-text' },
    ],
  },
  {
    key: 'investment',
    label: '投资收藏',
    icon: 'trending-up',
    color: '#EAB308',
    children: [
      { key: 'collectible', label: '收藏品', icon: 'trophy' },
      { key: 'precious-investment', label: '贵金属', icon: 'coins' },
    ],
  },
  {
    key: 'other',
    label: '其他',
    icon: 'package',
    color: '#9CA3AF',
    children: [{ key: 'misc-item', label: '其他物品', icon: 'package' }],
  },
];

export type ResolvedAssetCategory = AssetCategoryDefinition & {
  /** 所属大类 key（大类自身时等于 key） */
  parentKey: string;
  /** 所属大类 label */
  parentLabel: string;
  /** 是否为二级叶子 */
  isLeaf: boolean;
};

const PARENT_BY_KEY = new Map(ASSET_CATEGORY_DEFINITIONS.map((def) => [def.key, def]));

/** 叶子 key → { 父定义, 叶子定义 } */
const LEAF_BY_KEY = new Map<
  string,
  { parent: AssetCategoryDefinition; leaf: AssetSubcategoryDefinition }
>();
for (const parent of ASSET_CATEGORY_DEFINITIONS) {
  for (const leaf of parent.children) LEAF_BY_KEY.set(leaf.key, { parent, leaf });
}

export const DEFAULT_ASSET_CATEGORY = 'other';

/** 解析大类或叶子 key（未知 key 回落「其他」大类） */
export function resolveAssetCategory(key: string | null | undefined): ResolvedAssetCategory {
  if (key) {
    const parent = PARENT_BY_KEY.get(key);
    if (parent) {
      return { ...parent, parentKey: parent.key, parentLabel: parent.label, isLeaf: false };
    }
    const leaf = LEAF_BY_KEY.get(key);
    if (leaf) {
      return {
        key: leaf.leaf.key,
        label: leaf.leaf.label,
        icon: leaf.leaf.icon,
        color: leaf.parent.color,
        children: [],
        parentKey: leaf.parent.key,
        parentLabel: leaf.parent.label,
        isLeaf: true,
      };
    }
  }
  const fallback = PARENT_BY_KEY.get(DEFAULT_ASSET_CATEGORY)!;
  return {
    ...fallback,
    parentKey: fallback.key,
    parentLabel: fallback.label,
    isLeaf: false,
  };
}

/** 父类或叶子 key 是否合法 */
export function isAssetCategoryKey(key: string): boolean {
  return PARENT_BY_KEY.has(key) || LEAF_BY_KEY.has(key);
}

/** 某大类的二级分类列表（无二级时返回空数组） */
export function listAssetSubcategories(parentKey: string): readonly AssetSubcategoryDefinition[] {
  return PARENT_BY_KEY.get(parentKey)?.children ?? [];
}

export const ASSET_STATUS_ORDER: readonly AssetStatus[] = ['holding', 'sold', 'disposed'];

/** 状态展示元数据（label 在 zh.ts，这里只放颜色语义） */
export const ASSET_STATUS_COLOR: Record<AssetStatus, string> = {
  holding: '#10B981',
  sold: '#3B82F6',
  disposed: '#9CA3AF',
};
