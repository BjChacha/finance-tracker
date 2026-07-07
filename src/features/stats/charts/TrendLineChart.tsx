import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useTheme } from '@/theme';
import { ChartEmpty } from './ChartEmpty';

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
};

/** 双序列趋势折线图（隔离 gifted-charts）；金额分转元展示 */
export function TrendLineChart({
  points,
  primaryColor,
  primaryLabel,
  secondaryColor,
  secondaryLabel,
}: Props) {
  const theme = useTheme();
  const hasData = points.some((p) => p.primary !== 0 || (p.secondary ?? 0) !== 0);
  if (points.length === 0 || !hasData) return <ChartEmpty />;

  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const axisStyle = { color: theme.colors.textSecondary, fontSize: 10 };
  const data = points.map((p, i) => ({
    value: p.primary / 100,
    label: i % labelStep === 0 ? p.label : '',
    labelTextStyle: axisStyle,
  }));
  const hasSecondary = points.some((p) => p.secondary !== undefined);
  const data2 = hasSecondary ? points.map((p) => ({ value: (p.secondary ?? 0) / 100 })) : undefined;

  const chartWidth = Dimensions.get('window').width - 120;
  const spacing = Math.max(8, chartWidth / Math.max(points.length - 1, 1));

  return (
    <View>
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
      <LineChart
        data={data}
        data2={data2}
        color1={primaryColor}
        color2={secondaryColor}
        thickness={2}
        curved
        hideDataPoints
        width={chartWidth}
        spacing={spacing}
        initialSpacing={8}
        endSpacing={8}
        noOfSections={4}
        yAxisTextStyle={axisStyle}
        yAxisColor="transparent"
        xAxisColor={theme.colors.border}
        rulesColor={theme.colors.border}
        rulesType="dashed"
        yAxisLabelWidth={52}
        formatYLabel={(v) => {
          const n = Number(v);
          return Math.abs(n) >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(Math.round(n));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
  legendText: { fontSize: 12 },
});
