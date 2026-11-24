import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CalendarHeat,
  CompareBarChart,
  DonutChart,
  TrendLineChart,
} from '@/features/stats';
import {
  useCalendarHeatmap,
  useCategoryBreakdown,
  useTrend,
  useWeekdayTotals,
} from '@/features/stats/hooks';
import { CategoryDetailCard } from '@/features/stats/cards/CategoryDetailCard';
import { SpendingFlowCard } from '@/features/stats/cards/SpendingFlowCard';
import { WeekdayBars } from '@/features/stats/charts/WeekdayBars';
import { weekdaySummary } from '@/features/stats/weekday-model';
import { transactionParams } from '@/features/transactions/filters';
import { dayjs } from '@/lib/date';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';
import {
  Card,
  dashboardStyles,
  PeriodControl,
  QueryNotice,
  TextAction,
} from './components';
import { dashboardText as copy } from './labels';
import { usePeriod } from './use-period';

export function StatsScreen() {
  const period = usePeriod(useLocalSearchParams(), { withAll: true });
  const router = useRouter();
  const { colors } = useTheme();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [calendarMonth, setCalendarMonth] = useState('');
  const { range, comparison, granularity, comparisonClamped } = period;
  const firstMonth = range.start.slice(0, 7);
  const lastMonth = range.end.slice(0, 7);
  const heatMonth =
    calendarMonth >= firstMonth && calendarMonth <= lastMonth
      ? calendarMonth
      : lastMonth;
  // 构成环读这一份；「分类明细」卡内自行查询同一 key，命中同一份缓存
  const categories = useCategoryBreakdown(range, type);
  const trend = useTrend(granularity, range);
  const monthly = useTrend('month', range);
  // 最后一根月柱是否为进行中的当月（数据只走到今天）：降透明提示「未走完」
  const lastMonthInProgress =
    monthly.data != null &&
    monthly.data.length > 0 &&
    monthly.data[monthly.data.length - 1]!.key.slice(0, 7) ===
      period.today.slice(0, 7);
  const heat = useCalendarHeatmap(heatMonth);
  const weekday = useWeekdayTotals(range, type);
  const weekdayStat = weekday.data ? weekdaySummary(weekday.data) : null;
  const donut = useMemo(
    () =>
      (categories.data ?? []).map((item) => ({
        id: item.categoryId,
        label: item.name,
        value: item.total,
        color: item.color,
        pct: item.pct,
      })),
    [categories.data],
  );
  const openCategory = (id: string) => {
    const category = categories.data?.find((item) => item.categoryId === id);
    if (!category) return;
    router.push({
      pathname: '/transactions',
      params: transactionParams(
        { range, type, categoryId: id, includeChildren: true },
        category.name,
      ),
    });
  };
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[dashboardStyles.content, { paddingBottom: 40 }]}
    >
      <PeriodControl
        {...period}
        allSelected={period.all}
        onSelectAll={() => period.setAll(true)}
      />
      {period.all && <QueryNotice queries={[period.allStart]} />}
      {!period.all || period.allStart.data ? (
        <>
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>
            {range.start} — {range.end}
          </Text>
          <View style={dashboardStyles.row}>
            {(['expense', 'income'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: value === type }}
                onPress={() => setType(value)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: type === value ? colors.primary : colors.card,
                }}
              >
                <Text
                  style={{ color: type === value ? colors.onPrimary : colors.text }}
                >
                  {copy[value]}
                </Text>
              </Pressable>
            ))}
          </View>
          <Card title={copy.categoryAnalysis}>
            <QueryNotice queries={[categories]} />
            {categories.data && (
              <DonutChart
                data={donut}
                centerLabel={copy[type]}
                onDetails={openCategory}
              />
            )}
          </Card>
          <CategoryDetailCard
            range={range}
            type={type}
            comparison={comparison}
            comparisonClamped={comparisonClamped}
            onOpenCategory={openCategory}
          />
          <Card title={copy.cashTrend}>
            <QueryNotice queries={[trend]} />
            {trend.data && (
              <TrendLineChart
                points={trend.data.map((point) => ({
                  label: point.label,
                  detailLabel: point.key,
                  primary: point.expense,
                  secondary: point.income,
                }))}
                primaryColor={colors.expense}
                primaryLabel={copy.expense}
                secondaryColor={colors.income}
                secondaryLabel={copy.income}
              />
            )}
          </Card>
          <Card title={copy.monthlyComparison}>
            <QueryNotice queries={[monthly]} />
            {monthly.data && (
              <CompareBarChart
                data={monthly.data.map((point) => ({
                  label: point.label,
                  income: point.income,
                  expense: point.expense,
                }))}
                incomeLabel={copy.income}
                expenseLabel={copy.expense}
                dimLast={lastMonthInProgress}
              />
            )}
          </Card>
          <Card title={copy.weekdayTitle}>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
              {copy.weekdayHint}
            </Text>
            <QueryNotice queries={[weekday]} />
            {weekday.data && (
              <>
                {weekdayStat && (
                  <View style={dashboardStyles.between}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {copy.weekdayWorkday}{' '}
                      {formatCentsWithSymbol(weekdayStat.weekdayAvg)}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {copy.weekdayWeekend}{' '}
                      {formatCentsWithSymbol(weekdayStat.weekendAvg)}
                    </Text>
                  </View>
                )}
                <WeekdayBars
                  data={weekday.data.map((item) => ({
                    label: item.name,
                    value: item.dailyAvg,
                  }))}
                  height={168}
                />
                {weekdayStat?.weekendShare != null && (
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                    {`${copy.weekdayShare} ${Math.round(weekdayStat.weekendShare * 100)}%`}
                  </Text>
                )}
              </>
            )}
          </Card>
          <Card title={copy.calendar}>
            <View style={dashboardStyles.between}>
              {heatMonth > firstMonth ? (
                <TextAction
                  label="‹"
                  onPress={() =>
                    setCalendarMonth(
                      dayjs(`${heatMonth}-01`)
                        .subtract(1, 'month')
                        .format('YYYY-MM'),
                    )
                  }
                />
              ) : (
                <View />
              )}
              <Text style={{ color: colors.text }}>{heatMonth}</Text>
              {heatMonth < lastMonth ? (
                <TextAction
                  label="›"
                  onPress={() =>
                    setCalendarMonth(
                      dayjs(`${heatMonth}-01`).add(1, 'month').format('YYYY-MM'),
                    )
                  }
                />
              ) : (
                <View />
              )}
            </View>
            <QueryNotice queries={[heat]} />
            {heat.data && !heat.isPlaceholderData && (
              <CalendarHeat monthKey={heatMonth} cells={heat.data} />
            )}
          </Card>
          <SpendingFlowCard range={range} />
        </>
      ) : null}
    </ScrollView>
  );
}
