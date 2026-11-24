import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, QueryNotice } from '@/features/dashboard/components';
import { CategoryList } from '@/features/dashboard/category-list';
import { dashboardText as copy } from '@/features/dashboard/labels';
import { useTheme } from '@/theme';
import { useCategoryBreakdown, useCategoryRank } from '../hooks';
import { useCategoryTrend } from '../category-trend';
import { HBarList } from '../charts/HBarList';
import { MultiSeriesLineChart } from '../charts/MultiSeriesLineChart';
import type { BreakdownType, StatsRange } from '../repository';

/** 手机上超过四五条线就互相遮挡，默认只画前 4 个分类 */
const SERIES_LIMIT = 4;
const RANK_LIMIT = 10;

type DetailView = 'trend' | 'total' | 'rank';

const VIEWS: { id: DetailView; label: string }[] = [
  { id: 'trend', label: copy.viewTrend },
  { id: 'total', label: copy.viewTotal },
  { id: 'rank', label: copy.viewRank },
];

/**
 * 分类明细：趋势 / 合计 / 排行 三个视角合成一张卡。
 *
 * 三者读的是同一批数据的不同切面（时间维、占比维、排序维），并排铺开会把
 * 统计页拉得很长且信息重复；合并后共用页面的「支出/收入」选择，并且
 * **只查当前视角**——切到排行才发排行查询，切到趋势才拉 6 个月窗口。
 */
export function CategoryDetailCard({
  range,
  type,
  comparison,
  comparisonClamped,
  onOpenCategory,
  enabled = true,
}: {
  range: StatsRange;
  type: BreakdownType;
  /** 上一期区间；「全部时间」模式下为 null */
  comparison: { start: string; end: string } | null;
  comparisonClamped: boolean;
  onOpenCategory: (id: string) => void;
  enabled?: boolean;
}) {
  const { colors } = useTheme();
  const [view, setView] = useState<DetailView>('trend');
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  // 收入与支出的分类集合不同，沿用旧的隐藏集合会误隐藏新序列
  useEffect(() => setHiddenIds([]), [type, range.start, range.end]);

  const categories = useCategoryBreakdown(range, type, undefined, enabled);
  const previous = useCategoryBreakdown(
    comparison ?? range,
    type,
    undefined,
    enabled && comparison !== null,
  );
  const trend = useCategoryTrend(range, type, SERIES_LIMIT, enabled && view === 'trend');
  const rank = useCategoryRank(range, type, RANK_LIMIT, enabled && view === 'rank');

  const trendData = trend.data;
  const rankData = rank.data;

  // 趋势窗口可能比所选周期宽（月视图只有 1 个点看不出走向），必须写出来
  const trendHint = trendData
    ? `${trendData.keys[0]} — ${trendData.keys[trendData.keys.length - 1]} · 按一级分类归并 · 缺失月补零${
        trendData.truncated > 0 ? ` · 另有 ${trendData.truncated} 个分类并入「其他」` : ''
      }`
    : '按一级分类归并 · 缺失月补零';

  const tabs = (
    <View style={{ flexDirection: 'row', gap: 16 }}>
      {VIEWS.map((item) => {
        const active = item.id === view;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => setView(item.id)}
            style={{
              paddingBottom: 5,
              // 下划线而不是实心药丸：与上方的「支出/收入」实心切换区分开
              borderBottomWidth: 2,
              borderBottomColor: active ? colors.primary : 'transparent',
            }}
          >
            <Text
              style={{
                color: active ? colors.text : colors.textSecondary,
                fontSize: 13,
                fontWeight: active ? '600' : '400',
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Card title={copy.categoryDetail} action={tabs}>
      {view === 'trend' && (
        <>
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{trendHint}</Text>
          <QueryNotice queries={[trend]} />
          {trendData && (
            <MultiSeriesLineChart
              series={trendData.series.map((item) => ({
                id: item.categoryId,
                name: item.name,
                color: item.color,
              }))}
              points={trendData.keys.map((_, at) => ({
                label: trendData.labels[at] ?? '',
                detailLabel: trendData.keys[at],
                values: trendData.series.map((item) => item.values[at] ?? 0),
              }))}
              hiddenIds={hiddenIds}
              onToggleSeries={(id) =>
                setHiddenIds((current) =>
                  current.includes(id)
                    ? current.filter((item) => item !== id)
                    : [...current, id],
                )
              }
            />
          )}
        </>
      )}

      {view === 'total' && (
        <>
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
            {comparison
              ? `${copy.versus} ${comparison.start} — ${comparison.end}${
                  comparisonClamped ? copy.samePeriodSuffix : ''
                }`
              : copy.allHistory}
          </Text>
          <QueryNotice queries={[categories, previous]} />
          {categories.data && (
            <CategoryList
              items={categories.data}
              previous={previous.data}
              onPress={(item) => onOpenCategory(item.categoryId)}
              initiallyExpanded
            />
          )}
        </>
      )}

      {view === 'rank' && (
        <>
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{copy.rankHint}</Text>
          <QueryNotice queries={[rank]} />
          {rankData && (
            <HBarList
              items={rankData.map((item) => ({
                id: item.categoryId,
                name: item.name,
                color: item.color,
                total: item.total,
                pct: item.pct,
              }))}
              onPress={onOpenCategory}
            />
          )}
        </>
      )}
    </Card>
  );
}
