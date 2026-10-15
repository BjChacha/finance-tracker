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
} from '@/features/stats/hooks';
import { transactionParams } from '@/features/transactions/filters';
import { dayjs } from '@/lib/date';
import { useTheme } from '@/theme';
import { CategoryList } from './category-list';
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
  const period = usePeriod(useLocalSearchParams());
  const router = useRouter();
  const { colors } = useTheme();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [calendarMonth, setCalendarMonth] = useState('');
  const { range, comparison, granularity } = period;
  const firstMonth = range.start.slice(0, 7);
  const lastMonth = range.end.slice(0, 7);
  const heatMonth =
    calendarMonth >= firstMonth && calendarMonth <= lastMonth
      ? calendarMonth
      : lastMonth;
  const categories = useCategoryBreakdown(range, type);
  const previous = useCategoryBreakdown(comparison, type);
  const trend = useTrend(granularity, range);
  const monthly = useTrend('month', range);
  const heat = useCalendarHeatmap(heatMonth);
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
      <PeriodControl {...period} />
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
      <Card title={copy.categoryTotal}>
        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
          {copy.versus} {comparison.start} — {comparison.end}
        </Text>
        <QueryNotice queries={[categories, previous]} />
        {categories.data && previous.data && (
          <CategoryList
            items={categories.data}
            previous={previous.data}
            onPress={(item) => openCategory(item.categoryId)}
            initiallyExpanded
          />
        )}
      </Card>
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
            curved={false}
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
          />
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
    </ScrollView>
  );
}
