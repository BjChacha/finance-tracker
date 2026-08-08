import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useTheme } from '@/theme';
import { formatCompactYuan } from '@/lib/money';
import { ChartEmpty } from './ChartEmpty';
import { dashboardChartLayout } from './chart-layout';

export type LinePoint = {
  label: string;
  /** 主序列（分） */
  primary: number;
  /** 次序列（分），可选 */
  secondary?: number;
};

type Props = {
  points: LinePoint[];
  primaryColor: string;
  primaryLabel: string;
  secondaryColor?: string;
  secondaryLabel?: string;
  /** 图表高度，默认 200 */
  height?: number;
  /** 曲线平滑化 */
  curved?: boolean;
  /** 迷你火花线模式：隐藏图例/坐标轴/网格，仅保留曲线（含淡入填充） */
  compact?: boolean;
};

/** 向上取整到「漂亮刻度」1/2/5×10^k */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

/** 双序列趋势折线图（隔离 gifted-charts）；金额分转元展示 */
export function TrendLineChart({
  points,
  primaryColor,
  primaryLabel,
  secondaryColor,
  secondaryLabel,
  height,
  curved = true,
  compact,
}: Props) {
  const theme = useTheme();
  const { width: windowW } = useWindowDimensions();
  const hasData = points.some((p) => p.primary !== 0 || (p.secondary ?? 0) !== 0);
  if (points.length === 0 || !hasData) return <ChartEmpty />;

  const axisStyle = { color: theme.colors.textSecondary, fontSize: 10 };

  // 纵轴贴合数据范围（元）：双序列的 min/max。当最小值占最大值比例较大
  // （典型如净资产累计线，值都很大且彼此接近）时用 yAxisOffset 抬下限，
  // 折线充满图表高度；否则维持 0 锚（收支趋势按日补零 → min=0）。
  const vals: number[] = [];
  for (const p of points) {
    vals.push(p.primary / 100);
    if (p.secondary != null) vals.push(p.secondary / 100);
  }
  const rawMax = Math.max(...vals);
  const rawMin = Math.min(...vals);
  const range = rawMax - rawMin;
  const pad = range * 0.1 || rawMax * 0.1 || 1;
  let yAxisOffset = 0;
  let maxValue: number;
  if (rawMin > rawMax * 0.3) {
    // 抬下限让折线充满图表高度：step 取能覆盖数据带的最小漂亮刻度，
    // yAxisOffset 落到 step 整倍 → 纵轴标签都是规整数；必要时加粗 step 保证顶端盖住数据。
    let step = niceCeil((range + 2 * pad) / 4);
    let floor = Math.max(0, Math.floor((rawMin - pad) / step) * step);
    while (floor + step * 4 < rawMax) {
      step = niceCeil(step + 1e-6);
      floor = Math.max(0, Math.floor((rawMin - pad) / step) * step);
    }
    yAxisOffset = floor;
    maxValue = step * 4;
  } else {
    // 收支趋势等含 0 值的图：维持 0 锚
    maxValue = niceCeil(rawMax);
  }

  // Keep a conservative 64px horizontal inset that fits both dashboard and asset cards.
  const yAxisLabelWidth = compact ? 0 : 48;
  const sideSpacing = 8;
  const containerWidth = windowW - 64;
  const spacing = Math.max(
    6,
    (containerWidth - yAxisLabelWidth - sideSpacing * 2) / Math.max(points.length - 1, 1),
  );
  const labelCount = Math.min(points.length, 6);
  const labelIndexes = new Set(
    Array.from({ length: labelCount }, (_, index) =>
      labelCount === 1 ? 0 : Math.round((index * (points.length - 1)) / (labelCount - 1)),
    ),
  );
  const xAxisLabelWidth = 38;
  const data = points.map((point, index) => {
    const showLabel = !compact && labelIndexes.has(index);
    return {
      value: point.primary / 100,
      label: '',
      labelComponent: showLabel
        ? () => (
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={[
                axisStyle,
                styles.xAxisLabel,
                {
                  marginLeft: (spacing - xAxisLabelWidth) / 2,
                  width: xAxisLabelWidth,
                },
              ]}
            >
              {point.label}
            </Text>
          )
        : undefined,
    };
  });
  const hasSecondary = points.some((p) => p.secondary !== undefined);
  const data2 = hasSecondary ? points.map((p) => ({ value: (p.secondary ?? 0) / 100 })) : undefined;

  return (
    <View>
      {!compact && (
        <View style={styles.legend}>
          <View style={[styles.dot, { backgroundColor: primaryColor }]} />
          <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>
            {primaryLabel}
          </Text>
          {hasSecondary && secondaryColor && secondaryLabel ? (
            <>
              <View style={[styles.dot, { backgroundColor: secondaryColor }]} />
              <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>
                {secondaryLabel}
              </Text>
            </>
          ) : null}
        </View>
      )}
      <LineChart
        height={height ?? 200}
        data={data}
        data2={data2}
        color1={primaryColor}
        color2={secondaryColor}
        thickness={2}
        curved={!!curved}
        hideDataPoints
        spacing={spacing}
        initialSpacing={sideSpacing}
        endSpacing={sideSpacing}
        maxValue={maxValue}
        yAxisOffset={yAxisOffset}
        noOfSections={4}
        hideRules={compact}
        hideYAxisText={compact}
        hideOrigin={compact}
        yAxisTextStyle={axisStyle}
        yAxisColor="transparent"
        xAxisColor={compact ? 'transparent' : theme.colors.border}
        rulesColor={theme.colors.border}
        rulesType="dashed"
        yAxisLabelWidth={yAxisLabelWidth}
        areaChart={compact}
        startFillColor={primaryColor}
        endFillColor={primaryColor}
        startOpacity={0.22}
        endOpacity={0}
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
  xAxisLabel: { textAlign: 'center', fontVariant: ['tabular-nums'] },
});
