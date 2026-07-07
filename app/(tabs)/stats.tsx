import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CalendarHeat,
  CompareBarChart,
  DonutChart,
  HBarList,
  TrendLineChart,
  useAccountDistribution,
  useCalendarHeatmap,
  useCategoryBreakdown,
  useCategoryRank,
  useMonthlyCompare,
  useNetWorthTrend,
  useTrend,
  type BreakdownType,
  type StatsRange,
  type TrendGranularity,
} from '@/features/stats';
import { zh } from '@/i18n/zh';
import { dayjs, monthRange, todayKey, toMonthKey } from '@/lib/date';
import { useTheme, type AppTheme } from '@/theme';

type RangeMode = 'month' | '3m' | '6m' | 'year';

const RANGE_OPTIONS: { mode: RangeMode; label: string }[] = [
  { mode: 'month', label: zh.stats.rangeMonth },
  { mode: '3m', label: zh.stats.range3m },
  { mode: '6m', label: zh.stats.range6m },
  { mode: 'year', label: zh.stats.rangeYear },
];

function Section({
  title,
  right,
  children,
  theme,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  theme: AppTheme;
}) {
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.card }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export default function StatsScreen() {
  const theme = useTheme();
  const currentMonth = toMonthKey(todayKey());
  const [mode, setMode] = useState<RangeMode>('month');
  const [monthKey, setMonthKey] = useState(currentMonth);
  const [txType, setTxType] = useState<BreakdownType>('expense');
  const [drill, setDrill] = useState<{ id: string; name: string } | null>(null);

  const range = useMemo<StatsRange>(() => {
    switch (mode) {
      case 'month': {
        const [start, end] = monthRange(monthKey);
        return { start, end };
      }
      case '3m':
      case '6m': {
        const back = mode === '3m' ? 2 : 5;
        const start = dayjs(`${currentMonth}-01`).subtract(back, 'month').format('YYYY-MM-DD');
        return { start, end: monthRange(currentMonth)[1] };
      }
      case 'year': {
        const year = currentMonth.slice(0, 4);
        return { start: `${year}-01-01`, end: `${year}-12-31` };
      }
    }
  }, [mode, monthKey, currentMonth]);

  const granularity: TrendGranularity =
    mode === 'month' ? 'day' : mode === '3m' ? 'week' : 'month';

  const breakdown = useCategoryBreakdown(range, txType, drill?.id ?? null);
  const trendQuery = useTrend(granularity, range);
  const compare = useMonthlyCompare(6);
  const accountDist = useAccountDistribution();
  const netWorth = useNetWorthTrend(6);
  const heatmap = useCalendarHeatmap(monthKey);
  const rank = useCategoryRank(range, txType, 10);

  const selectMode = (m: RangeMode) => {
    setMode(m);
    setMonthKey(currentMonth);
    setDrill(null);
  };
  const selectType = (t: BreakdownType) => {
    setTxType(t);
    setDrill(null);
  };
  const shiftMonth = (delta: number) => {
    setMonthKey(dayjs(`${monthKey}-01`).add(delta, 'month').format('YYYY-MM'));
    setDrill(null);
  };

  const donutData = (breakdown.data ?? []).map((s) => ({
    id: s.categoryId,
    label: s.name,
    value: s.total,
    color: s.color,
    icon: s.icon,
    pct: s.pct,
  }));
  const trendPoints = (trendQuery.data ?? []).map((p) => ({
    label: p.label,
    primary: p.expense,
    secondary: p.income,
  }));
  const netWorthPoints = (netWorth.data ?? []).map((p) => ({
    label: dayjs(`${p.month}-01`).format('M月'),
    primary: p.value,
  }));

  const segActive = { backgroundColor: theme.colors.primary };
  const segText = (active: boolean) => ({
    color: active ? '#FFFFFF' : theme.colors.textSecondary,
    fontSize: 13,
  });

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
    >
      {/* 时间范围 */}
      <View style={[styles.segment, { backgroundColor: theme.colors.card }]}>
        {RANGE_OPTIONS.map((opt) => (
          <Pressable
            key={opt.mode}
            style={[styles.segmentItem, mode === opt.mode && segActive]}
            onPress={() => selectMode(opt.mode)}
          >
            <Text style={segText(mode === opt.mode)}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* 本月模式下的月份切换 */}
      {mode === 'month' ? (
        <View style={styles.monthSwitch}>
          <Pressable onPress={() => shiftMonth(-1)} hitSlop={8}>
            <Text style={[styles.monthArrow, { color: theme.colors.primary }]}>‹</Text>
          </Pressable>
          <Text style={[styles.monthText, { color: theme.colors.text }]}>
            {dayjs(`${monthKey}-01`).format('YYYY年M月')}
          </Text>
          <Pressable
            onPress={() => shiftMonth(1)}
            hitSlop={8}
            disabled={monthKey >= currentMonth}
          >
            <Text
              style={[
                styles.monthArrow,
                { color: monthKey >= currentMonth ? theme.colors.border : theme.colors.primary },
              ]}
            >
              ›
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* 支出/收入切换 */}
      <View style={[styles.segment, { backgroundColor: theme.colors.card }]}>
        {(['expense', 'income'] as const).map((t) => (
          <Pressable
            key={t}
            style={[styles.segmentItem, txType === t && segActive]}
            onPress={() => selectType(t)}
          >
            <Text style={segText(txType === t)}>{zh.tx[t]}</Text>
          </Pressable>
        ))}
      </View>

      {/* 分类占比（可下钻二级） */}
      <Section
        title={drill ? `${zh.stats.breakdownTitle} · ${drill.name}` : zh.stats.breakdownTitle}
        theme={theme}
        right={
          drill ? (
            <Pressable onPress={() => setDrill(null)} hitSlop={8}>
              <Text style={{ color: theme.colors.primary, fontSize: 13 }}>{zh.stats.back}</Text>
            </Pressable>
          ) : undefined
        }
      >
        <DonutChart
          data={donutData}
          centerLabel={txType === 'expense' ? zh.stats.totalExpense : zh.stats.totalIncome}
          onSlicePress={
            drill
              ? undefined
              : (id) => {
                  const slice = donutData.find((d) => d.id === id);
                  if (slice) setDrill({ id, name: slice.label });
                }
          }
        />
      </Section>

      {/* 收支趋势 */}
      <Section title={zh.stats.trendTitle} theme={theme}>
        <TrendLineChart
          points={trendPoints}
          primaryColor={theme.colors.expense}
          primaryLabel={zh.tx.expense}
          secondaryColor={theme.colors.income}
          secondaryLabel={zh.tx.income}
        />
      </Section>

      {/* 月度对比 */}
      <Section title={zh.stats.compareTitle} theme={theme}>
        <CompareBarChart
          data={(compare.data ?? []).map((m) => ({
            label: dayjs(`${m.month}-01`).format('M月'),
            income: m.income,
            expense: m.expense,
          }))}
          incomeLabel={zh.tx.income}
          expenseLabel={zh.tx.expense}
        />
      </Section>

      {/* 账户资产分布 */}
      <Section title={zh.stats.accountTitle} theme={theme}>
        <HBarList items={accountDist.data ?? []} />
      </Section>

      {/* 净资产趋势 */}
      <Section title={zh.stats.netWorthTitle} theme={theme}>
        <TrendLineChart
          points={netWorthPoints}
          primaryColor={theme.colors.primary}
          primaryLabel={zh.stats.netWorth}
        />
      </Section>

      {/* 消费日历（仅本月模式） */}
      {mode === 'month' ? (
        <Section title={zh.stats.heatmapTitle} theme={theme}>
          <CalendarHeat monthKey={monthKey} cells={heatmap.data ?? []} />
        </Section>
      ) : null}

      {/* 分类排行 */}
      <Section title={zh.stats.rankTitle} theme={theme}>
        <HBarList
          items={(rank.data ?? []).map((r) => ({
            id: r.categoryId,
            name: r.name,
            icon: r.icon,
            color: r.color,
            total: r.total,
            pct: r.pct,
          }))}
        />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  segment: { flexDirection: 'row', borderRadius: 10, padding: 4 },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  monthSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  monthArrow: { fontSize: 26, fontWeight: '600', paddingHorizontal: 8 },
  monthText: { fontSize: 15, fontWeight: '600' },
  card: { borderRadius: 12, padding: 16 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '600' },
});
