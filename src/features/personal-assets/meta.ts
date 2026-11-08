import type { IconName } from '@/components/Icon';
import type { AssetStatus } from '@/db/schema';

/**
 * 个人资产类别预设（key/label/icon/color）。
 * 存 key 文本，展示层经 resolveAssetCategory 兜底，后续调整预设不丢历史数据。
 * 配色取自应用常用数据色池，图表中可区分。
 */
export type AssetCategoryDefinition = {
  key: string;
  label: string;
  icon: IconName;
  color: string;
};

export const ASSET_CATEGORY_DEFINITIONS: readonly AssetCategoryDefinition[] = [
  { key: 'electronics', label: '电子数码', icon: 'smartphone', color: '#3B82F6' },
  { key: 'appliance', label: '家电设备', icon: 'tv', color: '#06B6D4' },
  { key: 'home', label: '家居家具', icon: 'house', color: '#F59E0B' },
  { key: 'vehicle', label: '车辆出行', icon: 'car', color: '#EF4444' },
  { key: 'clothing', label: '服饰箱包', icon: 'shopping-bag', color: '#EC4899' },
  { key: 'jewelry', label: '珠宝首饰', icon: 'gem', color: '#8B5CF6' },
  { key: 'sports', label: '运动器材', icon: 'volleyball', color: '#10B981' },
  { key: 'books', label: '图书影音', icon: 'book-open', color: '#F97316' },
  { key: 'music', label: '乐器音乐', icon: 'music', color: '#14B8A6' },
  { key: 'digital', label: '虚拟资产', icon: 'sparkles', color: '#A855F7' },
  { key: 'subscription', label: '订阅服务', icon: 'repeat', color: '#0EA5E9' },
  { key: 'investment', label: '投资收藏', icon: 'trending-up', color: '#EAB308' },
  { key: 'other', label: '其他', icon: 'package', color: '#9CA3AF' },
];

const BY_KEY = new Map(ASSET_CATEGORY_DEFINITIONS.map((def) => [def.key, def]));

export const DEFAULT_ASSET_CATEGORY = 'other';

export function resolveAssetCategory(key: string | null | undefined): AssetCategoryDefinition {
  return (key && BY_KEY.get(key)) || BY_KEY.get(DEFAULT_ASSET_CATEGORY)!;
}

export function isAssetCategoryKey(key: string): boolean {
  return BY_KEY.has(key);
}

export const ASSET_STATUS_ORDER: readonly AssetStatus[] = ['holding', 'sold', 'disposed'];

/** 状态展示元数据（label 在 zh.ts，这里只放颜色语义） */
export const ASSET_STATUS_COLOR: Record<AssetStatus, string> = {
  holding: '#10B981',
  sold: '#3B82F6',
  disposed: '#9CA3AF',
};
