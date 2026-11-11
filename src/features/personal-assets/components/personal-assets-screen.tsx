import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { IconBubble } from '@/components/IconBubble';
import { useFloatingTabBarInset } from '@/components/navigation/floating-tab-bar';
import { DonutChart } from '@/features/stats/charts/DonutChart';
import { HBarList } from '@/features/stats/charts/HBarList';
import { TrendLineChart, type LinePoint } from '@/features/stats/charts/TrendLineChart';
import { zh } from '@/i18n/zh';
import { formatCents, formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';
import type { AssetStatus } from '@/db/schema';
import { AssetListItem } from './asset-detail-screen';
import {
  ASSET_STATUS_COLOR,
  assetHealth,
  categoryBreakdown,
  computeAssetStats,
		costTrend,
  realizedGainTrend,
  topAssets,
  usePersonalAssets,
} from '..';

type StatusFilter = 'all' | AssetStatus;

/**
 * 资产页签场景。
 *
 * 结构：发现横幅（有候选时）→ 总览卡（市值大数字 + 三指标 + 右上角「新增」）
 * → 分段切换「清单 / 统计」→ 单一内容区（清单为主任务默认视图，统计收纳
 * 三张图表）。无资产时仅显示空态引导与新增入口。作为一级页签常驻，
 * 无 sheet 壳；底部预留浮动页签栏与「记一笔」FAB 的空间。
 */
export function PersonalAssetsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const copy = zh.personalAssets;
  const tabBarInset = useFloatingTabBarInset();
  const [filter, setFilter] = useState<StatusFilter>('all');
  /** 内容分区：清单（默认，管理资产的主任务） / 统计（图表收纳） */
  const [mode, setMode] = useState<'list' | 'stats'>('list');

  const assetsQuery = usePersonalAssets();
  const assets = useMemo(() => assetsQuery.data ?? [], [assetsQuery.data]);

  const stats = useMemo(() => computeAssetStats(assets), [assets]);
  const slices = useMemo(() => categoryBreakdown(assets), [assets]);
  const topItems = useMemo(() => topAssets(assets), [assets]);
  /** 持有成本趋势（近12月）：单序列成本基线 */
  const trendPoints = useMemo<LinePoint[]>(
    () =>
      costTrend(assets).map((p) => ({
        label: p.label,
        detailLabel: detailMonthLabel(p.label),
        primary: p.costCents,
      })),
    [assets],
  );
  /** 累计实现收益曲线 */
  const realizedTrendPoints = useMemo<LinePoint[]>(
    () =>
      realizedGainTrend(assets).map((p) => ({
        label: p.label,
        detailLabel: detailMonthLabel(p.label),
        primary: p.realizedGainCents,
      })),
    [assets],
  );
  const health = useMemo(() => assetHealth(assets), [assets]);

  const visible = filter === 'all' ? assets : assets.filter((a) => a.status === filter);
  const hasAssets = stats.counts.all > 0;

  const filterChips: Array<{ key: StatusFilter; label: string; count: number; color: string }> = [
    { key: 'all', label: copy.filterAll, count: stats.counts.all, color: colors.primary },
    { key: 'holding', label: copy.status.holding, count: stats.counts.holding, color: ASSET_STATUS_COLOR.holding },
    { key: 'sold', label: copy.status.sold, count: stats.counts.sold, color: ASSET_STATUS_COLOR.sold },
    { key: 'disposed', label: copy.status.disposed, count: stats.counts.disposed, color: ASSET_STATUS_COLOR.disposed },
  ];

  /** 概览三指标（金额分 / 件数）：现役件数、已实现收益、累计投入 */
  const kpiCells: Array<{ label: string; text: string; color: string }> = [
    {
      label: copy.overviewHoldingCount,
      text: `${stats.counts.holding} ${copy.quantityUnit}`,
      color: colors.text,
    },
    {
      label: copy.realizedGain,
      text: formatCents(stats.realizedGainCents, { sign: true }),
      color: stats.realizedGainCents > 0
        ? colors.income
        : stats.realizedGainCents < 0
          ? colors.expense
          : colors.textSecondary,
    },
    {
      label: copy.overviewTotalCost,
      text: formatCentsWithSymbol(stats.totalCostCents),
      color: colors.text,
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: tabBarInset + 16 }}
        showsVerticalScrollIndicator={false}
      >
        {!hasAssets ? (
          <>
            <EmptyState />
            <AddAssetButton onPress={() => router.push('/personal-assets/edit')} />
            <FindFromLedgerLink centered onPress={() => router.push('/personal-assets/candidates')} />
          </>
        ) : (
          <>
            {/* 总览卡：持有成本大数字 + 三指标；主操作「新增」并入卡片右上角 */}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.heroHeader}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{copy.holdingCost}</Text>
                <HeroAddPill onPress={() => router.push('/personal-assets/edit')} />
              </View>
              <Text
                testID="assets-kpi-holding-cost"
                style={{ color: colors.text, fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'] }}
              >
                {formatCentsWithSymbol(stats.holdingCostCents)}
              </Text>
              <View style={[styles.kpiRow, { borderTopColor: colors.border }]}>
                {kpiCells.map((cell, i) => (
                  <View
                    key={cell.label}
                    style={[styles.kpiCell, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }} numberOfLines={1}>
                      {cell.label}
                    </Text>
                    <Text
                      style={{ color: cell.color, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {cell.text}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* 分段切换：清单 / 统计（样式与预算页周期切换一致） */}
            <View style={[styles.segmentWrap, { backgroundColor: colors.card }]}>
              {(['list', 'stats'] as const).map((key) => {
                const active = mode === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={key === 'list' ? copy.segmentList : copy.segmentStats}
                    style={[styles.segment, active && { backgroundColor: colors.primary }]}
                    onPress={() => setMode(key)}
                  >
                    <Text
                      style={{
                        color: active ? colors.onPrimary : colors.textSecondary,
                        fontSize: 14,
                        fontWeight: '600',
                      }}
                    >
                      {key === 'list' ? copy.segmentList : copy.segmentStats}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {mode === 'stats' ? (
              <>
                {/* 类别分布 */}
                <View style={[styles.card, { backgroundColor: colors.card }]}>
                  <Text style={cardTitleStyle(colors.text)}>{copy.categoryTitle}</Text>
                  <DonutChart data={slices.map((s) => ({ ...s, pct: 0 }))} centerLabel={copy.holdingCost} />
                </View>

                {/* 持有成本趋势 */}
                <View style={[styles.card, { backgroundColor: colors.card }]}>
                  <Text style={cardTitleStyle(colors.text)}>{copy.trendTitle}</Text>
                  <TrendLineChart
                    points={trendPoints}
                    primaryColor={colors.primary}
                    primaryLabel={copy.holdingCost}
                    height={168}
                  />
                </View>

                {/* 累计实现收益 */}
                <View style={[styles.card, { backgroundColor: colors.card }]}>
                  <Text style={cardTitleStyle(colors.text)}>{copy.realizedTrendTitle}</Text>
                  <TrendLineChart
                    points={realizedTrendPoints}
                    primaryColor={colors.income}
                    primaryLabel={copy.realizedTrendLabel}
                    height={160}
                    curved={false}
                  />
                </View>

                {/* 资产体检 */}
                <View style={[styles.card, { backgroundColor: colors.card }]}>
                  <Text style={cardTitleStyle(colors.text)}>{copy.healthTitle}</Text>
                  <View style={styles.healthRow}>
                    {[
                      {
                        label: copy.healthHolding,
                        value: `${health.holdingCount} ${copy.healthHoldingUnit}`,
                      },
                      {
                        label: copy.healthAvgAge,
                        value: `${health.weightedAvgHoldingDays} 天`,
                      },
                      {
                        label: copy.healthAdded,
                        value: `${health.addedLastYear} ${copy.healthHoldingUnit}`,
                      },
                      {
                        label: copy.healthExited,
                        value: `${health.exitedLastYear} ${copy.healthHoldingUnit}`,
                      },
                    ].map((cell, i) => (
                      <View
                        key={cell.label}
                        style={[
                          styles.healthCell,
                          i > 0 && {
                            borderLeftWidth: StyleSheet.hairlineWidth,
                            borderLeftColor: colors.border,
                          },
                        ]}
                      >
                        <Text style={{ color: colors.textSecondary, fontSize: 11 }} numberOfLines={1}>
                          {cell.label}
                        </Text>
                        <Text
                          style={{ color: colors.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.7}
                        >
                          {cell.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* 价值 Top */}
                <View style={[styles.card, { backgroundColor: colors.card }]}>
                  <Text style={cardTitleStyle(colors.text)}>{copy.topTitle}</Text>
                  <HBarList items={topItems} />
                </View>
              </>
            ) : (
              <>
                {/* 状态筛选 */}
                <View style={styles.chipRow}>
                  {filterChips.map((chip) => {
                    const selected = filter === chip.key;
                    return (
                      <Pressable
                        key={chip.key}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${chip.label} ${chip.count}`}
                        style={[
                          styles.filterChip,
                          { borderColor: selected ? chip.color : colors.border },
                          selected && { backgroundColor: chip.color },
                        ]}
                        onPress={() => setFilter(chip.key)}
                      >
                        <Text style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 13 }}>
                          {chip.label} {chip.count}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* 资产清单 */}
                <View style={styles.listHeader}>
                  <Text style={[styles.listTitle, { color: colors.textSecondary }]}>
                    {copy.listTitle} · {copy.perAssetCount(visible.length)}
                  </Text>
                  <FindFromLedgerLink onPress={() => router.push('/personal-assets/candidates')} />
                </View>
                {visible.map((asset) => (
                  <AssetListItem
                    key={asset.id}
                    asset={asset}
                    onPress={() => router.push(`/personal-assets/${asset.id}`)}
                  />
                ))}
                {visible.length === 0 && (
                  <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingVertical: 20 }}>
                    {zh.common.empty}
                  </Text>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** 总览卡右上角的紧凑新增入口 */
function HeroAddPill({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const copy = zh.personalAssets;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.add}
      onPress={onPress}
      style={({ pressed }) => [
        styles.heroAddPill,
        { borderColor: colors.primary, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name="plus" size={13} color={colors.primary} />
      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>{copy.addShort}</Text>
    </Pressable>
  );
}

/** 空态大号新增入口（有资产后入口收敛到总览卡右上角的 HeroAddPill） */
function AddAssetButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const copy = zh.personalAssets;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.add}
      onPress={onPress}
      style={({ pressed }) => [
        styles.addButton,
        { borderColor: colors.primary, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name="plus" size={18} color={colors.primary} />
      <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>{copy.add}</Text>
    </Pressable>
  );
}

/** 「从支出发现」统一入口（清单头右缘 / 空态居中两用） */
function FindFromLedgerLink({ onPress, centered }: { onPress: () => void; centered?: boolean }) {
  const { colors } = useTheme();
  const copy = zh.personalAssets;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.findFromLedger}
      onPress={onPress}
      style={({ pressed }) => [
        styles.findAction,
        centered && styles.findActionCentered,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name="sparkles" size={14} color={colors.primary} />
      <Text style={{ color: colors.primary, fontSize: 12 }}>{copy.findFromLedger}</Text>
    </Pressable>
  );
}

/** 趋势点 detailLabel：把紧凑 'YY/M' 展开成 'YYYY年M月' */
function detailMonthLabel(compact: string): string {
  const [yy, mm] = compact.split('/');
  return `${2000 + Number(yy)}年${Number(mm)}月`;
}

function EmptyState() {
  const { colors } = useTheme();
  const copy = zh.personalAssets;
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 12 }}>
      <IconBubble name="package" color={colors.primary} size={56} />
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{copy.empty}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
        {copy.emptyHint}
      </Text>
    </View>
  );
}

const cardTitleStyle = (textColor: string) => ({
  color: textColor,
  fontSize: 15,
  fontWeight: '600' as const,
  marginBottom: 12,
});

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, marginBottom: 10 },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  heroAddPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minHeight: 30,
  },
  segmentWrap: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginBottom: 10,
  },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  kpiRow: { flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  kpiCell: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterChip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 10,
    minHeight: 44,
  },
  healthRow: { flexDirection: 'row' },
  healthCell: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listTitle: { fontSize: 13, fontWeight: '600', marginHorizontal: 4, marginTop: 4, marginBottom: 8 },
  findAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 32,
    paddingHorizontal: 4,
  },
  findActionCentered: { justifyContent: 'center', marginTop: 12 },
});
