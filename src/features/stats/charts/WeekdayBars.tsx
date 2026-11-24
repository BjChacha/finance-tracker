import { View, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useTheme } from '@/theme';
import { formatCompactYuan } from '@/lib/money';
import { ChartEmpty } from './ChartEmpty';

export type WeekdayBar = {
  label: string;
  /** 分 */
  value: number;
};

type Props = {
  data: WeekdayBar[];
  height?: number;
};

/**
 * 七根柱的星期分布（隔离 gifted-charts）。
 *
 * 单序列、七根柱全部同色：这里要表达的是「形状」（哪几天高），
 * 而不是分类归属；把周末涂成红色会暗示「周末=坏」，那是判断而非事实。
 * 周末与工作日的对比结论放在图表上方的汇总行里用数字说。
 */
export function WeekdayBars({ data, height }: Props) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  if (data.length === 0 || data.every((item) => item.value === 0)) {
    return <ChartEmpty />;
  }

  const axisStyle = { color: theme.colors.textSecondary, fontSize: 10 };
  const bars = data.map((item) => ({
    value: item.value / 100,
    frontColor: theme.colors.primary,
    label: item.label,
    labelWidth: 40,
    labelTextStyle: axisStyle,
    spacing: 14,
  }));
  const chartWidth = Math.max(160, windowWidth - 140);
  const barWidth = Math.max(8, Math.floor(chartWidth / data.length) - 14);

  return (
    <View>
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
