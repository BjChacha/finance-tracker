import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useTheme } from '@/theme';
import { formatCompactYuan } from '@/lib/money';
import { ChartEmpty } from './ChartEmpty';
import { dashboardChartLayout } from './chart-layout';

export type CompareGroup = {
  label: string;
  /** 分 */
  income: number;
  /** 分 */
  expense: number;
};

type Props = {
  data: CompareGroup[];
  incomeLabel: string;
  expenseLabel: string;
  /** 图表高度，不传则用 gifted-charts 默认 */
  height?: number;
};

/** 分组柱状图：每组 收入 vs 支出（隔离 gifted-charts） */
export function CompareBarChart({ data, incomeLabel, expenseLabel, height }: Props) {
  const theme = useTheme();
  const hasData = data.some((d) => d.income !== 0 || d.expense !== 0);
  if (data.length === 0 || !hasData) return <ChartEmpty />;

  const axisStyle = { color: theme.colors.textSecondary, fontSize: 10 };
  const bars = data.flatMap((d) => [
    {
      value: d.income / 100,
      frontColor: theme.colors.income,
      spacing: 2,
      label: d.label,
      labelWidth: 40,
      labelTextStyle: axisStyle,
    },
    { value: d.expense / 100, frontColor: theme.colors.expense, spacing: 18 },
  ]);
  const chartWidth = Dimensions.get('window').width - 130;
  const barWidth = Math.max(8, Math.floor(chartWidth / data.length / 2) - 10);

  return (
    <View>
      <View style={styles.legend}>
        <View style={[styles.dot, { backgroundColor: theme.colors.income }]} />
        <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>
          {incomeLabel}
        </Text>
        <View style={[styles.dot, { backgroundColor: theme.colors.expense }]} />
        <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>
          {expenseLabel}
        </Text>
      </View>
      <BarChart
        data={bars}
        height={height}
        barWidth={barWidth}
        barBorderRadius={3}
        noOfSections={4}
        initialSpacing={8}
        yAxisTextStyle={axisStyle}
        yAxisColor="transparent"
        xAxisColor={theme.colors.border}
        rulesColor={theme.colors.border}
        rulesType="dashed"
        yAxisLabelWidth={52}
        formatYLabel={(v) => formatCompactYuan(Number(v))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: dashboardChartLayout.legendGap,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
  legendText: { fontSize: 12 },
});
