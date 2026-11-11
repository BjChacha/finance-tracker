import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSetting, setSetting } from '@/db/settings';
import { dashboardText } from './labels';

/** 可定制模块的 key（SpendingOverview 大数字区固定置顶，不参与定制） */
export const DASHBOARD_SECTION_KEYS = [
  'insights',
  'report',
  'assets',
  'categories',
  'pace',
  'highlights',
] as const;

export type DashboardSectionKey = (typeof DASHBOARD_SECTION_KEYS)[number];

export type DashboardLayout = {
  /** 展示顺序 */
  order: DashboardSectionKey[];
  /** 隐藏的模块（隐藏 = 不渲染 = 不执行其查询） */
  hidden: DashboardSectionKey[];
};

export const DEFAULT_LAYOUT: DashboardLayout = {
  order: [...DASHBOARD_SECTION_KEYS],
  hidden: [],
};

/** 模块元信息（设置页标题/图标） */
export const DASHBOARD_SECTION_META: Record<
  DashboardSectionKey,
  { title: string; icon: string }
> = {
  insights: { title: '智能洞察', icon: 'sparkles' },
  report: { title: '消费报告', icon: 'book-open' },
  assets: { title: dashboardText.assetSummary, icon: 'coins' },
  categories: { title: dashboardText.where, icon: 'chart-pie' },
  pace: { title: dashboardText.spendingPace, icon: 'trending-up' },
  highlights: { title: dashboardText.largeExpenses, icon: 'search' },
};

/**
 * 归一化已保存布局：丢弃未知 key、补上新增模块（保持默认相对顺序），
 * hidden 去重且必须 ⊆ order。纯函数，便于单测。
 */
export function normalizeLayout(stored: unknown): DashboardLayout {
  const known = new Set<string>(DASHBOARD_SECTION_KEYS);
  const orderRaw = Array.isArray(
    (stored as { order?: unknown })?.order,
  )
    ? ((stored as { order: unknown[] }).order.filter(
        (key): key is DashboardSectionKey => typeof key === 'string' && known.has(key),
      ) as DashboardSectionKey[])
    : [];
  const orderSet = new Set(orderRaw);
  const order = [
    ...orderRaw,
    ...DASHBOARD_SECTION_KEYS.filter((key) => !orderSet.has(key)),
  ];
  const hiddenRaw = Array.isArray(
    (stored as { hidden?: unknown })?.hidden,
  )
    ? ((stored as { hidden: unknown[] }).hidden.filter(
        (key): key is DashboardSectionKey =>
          typeof key === 'string' && known.has(key),
      ) as DashboardSectionKey[])
    : [];
  return { order, hidden: [...new Set(hiddenRaw)] };
}

const LAYOUT_KEY = 'dashboard.layout';

async function loadLayout(): Promise<DashboardLayout> {
  return normalizeLayout(await getSetting<unknown>(LAYOUT_KEY));
}

/** key: ['dashboardLayout'] */
export function useDashboardLayout() {
  return useQuery({
    queryKey: ['dashboardLayout'],
    queryFn: loadLayout,
    // 布局变更频率极低且只在本机发生；拿旧值先渲染也无碍
    staleTime: Infinity,
  });
}

export function useSetDashboardLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (layout: DashboardLayout) => setSetting(LAYOUT_KEY, layout),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboardLayout'] }),
  });
}
