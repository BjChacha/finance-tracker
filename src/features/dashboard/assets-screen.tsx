import { ScrollView, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { DonutChart, TrendLineChart } from '@/features/stats';
import {
  useAccountDistribution,
  useNetWorthTrend,
} from '@/features/stats/hooks';
import { dayjs } from '@/lib/date';
import { useTheme } from '@/theme';
import { AssetCard } from './asset-card';
import {
  Card,
  dashboardStyles,
  PeriodControl,
  QueryNotice,
} from './components';
import { dashboardText as copy } from './labels';
import { usePeriod } from './use-period';

/** 净值趋势固定看最近 12 个月（与上方所选周期无关），是一年视角的基线 */
const NET_WORTH_MONTHS = 12;

export function AssetsScreen() {
  const params = useLocalSearchParams();
  const period = usePeriod(params, { withAll: true });
  const { colors } = useTheme();
  const mix = useAccountDistribution();
  const netWorth = useNetWorthTrend(NET_WORTH_MONTHS);
  return (
    <ScrollView
      contentContainerStyle={[dashboardStyles.content, { paddingBottom: 40 }]}
      style={{ backgroundColor: colors.background }}
    >
      <PeriodControl
        {...period}
        allSelected={period.all}
        onSelectAll={() => period.setAll(true)}
      />
      {period.all && (
        <>
          <QueryNotice queries={[period.allStart]} />
          {period.allStart.data ? (
            <Text style={{ color: colors.textSecondary }}>
              {copy.allHistory} · {period.range.start} — {period.range.end}
            </Text>
          ) : null}
        </>
      )}
      <AssetCard
        range={period.range}
        granularity={period.granularity}
        detail
        enabled={!period.all || !!period.allStart.data}
      />
      {/* 账户构成：净值「是多少」，构成回答「在哪」 */}
      <Card title={copy.accountMix}>
        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
          {copy.accountMixHint}
        </Text>
        <QueryNotice queries={[mix]} />
        {mix.data && (
          <DonutChart
            data={mix.data.map((item) => ({
              id: item.id,
              label: item.name,
              value: item.total,
              color: item.color,
              pct: item.pct,
            }))}
            centerLabel={copy.assets}
          />
        )}
      </Card>
      {/* 近 12 个月净值：跨周期的长期趋势，不随上方周期选择变化 */}
      <Card title={copy.netWorthRecent}>
        <QueryNotice queries={[netWorth]} />
        {netWorth.data && netWorth.data.length > 0 && (
          <TrendLineChart
            points={netWorth.data.map((point) => ({
              // 固定两位月份：'26.2' 与 '25.12' 混排会让刻度看起来参差不齐
              label: dayjs(`${point.month}-01`).format('YY.MM'),
              detailLabel: point.month,
              primary: point.value,
            }))}
            primaryColor={colors.primary}
            primaryLabel={copy.netWorth}
            height={180}
          />
        )}
      </Card>
    </ScrollView>
  );
}
