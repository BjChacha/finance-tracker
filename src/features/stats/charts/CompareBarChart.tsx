import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
  /**
   * 最后一组是进行中的月份（数据只走到今天）时传 true：
   * 该组柱子降为半透明，避免矮一截被误读为「这个月花得少」。
   */
  dimLast?: boolean;
};

/** #RRGGBB → rgba(...)；非 6 位 hex 原样返回（主题色均为 hex） */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = Number.parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * 分组柱状图：每组 收入 vs 支出（隔离 gifted-charts）。
 *
 * 支出柱用中性灰而非 expense 红——红色只表达「坏消息」（超支、赤字、支出上升），
 * 月度对比里的支出柱只是普通数据，不该整年都是红色（Sure money-flow 同款哲学）。
 */
export function CompareBarChart({ data, incomeLabel, expenseLabel, height, dimLast }: Props) {
  const theme = useTheme();
  // 跟随窗口/分屏/旋转变化，避免模块级缓存尺寸失效
  const { width: windowWidth } = useWindowDimensions();
  const hasData = data.some((d) => d.income !== 0 || d.expense !== 0);
  if (data.length === 0 || !hasData) return <ChartEmpty />;

  const axisStyle = { color: theme.colors.textSecondary, fontSize: 10 };
  const expenseBarColor = theme.colors.textSecondary;
  const dimFactor = 0.45;
  const bars = data.flatMap((d, i) => {
    const dim = dimLast === true && i === data.length - 1;
    return [
      {
        value: d.income / 100,
        frontColor: withAlpha(theme.colors.income, dim ? dimFactor : 1),
        spacing: 2,
        label: d.label,
        labelWidth: 40,
        labelTextStyle: axisStyle,
      },
      {
        value: d.expense / 100,
        frontColor: withAlpha(expenseBarColor, dim ? dimFactor : 1),
        spacing: 18,
      },
    ];
  });
  // 宽度扣掉页面内边距、Y 轴标签与每组间距；最小 160 保证窄屏仍可读
  const chartWidth = Math.max(160, windowWidth - 140);
  const barWidth = Math.max(6, Math.floor(chartWidth / data.length / 2) - 10);

  return (
    <View>
      <View style={styles.legend}>
        <View style={[styles.dot, { backgroundColor: theme.colors.income }]} />
        <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>
          {incomeLabel}
        </Text>
        <View style={[styles.dot, { backgroundColor: expenseBarColor }]} />
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
