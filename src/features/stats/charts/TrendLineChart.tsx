import { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useTheme } from '@/theme';
import { formatCompactYuan, formatCentsWithSymbol } from '@/lib/money';
import { ChartEmpty } from './ChartEmpty';
import { dashboardChartLayout } from './chart-layout';
import { lineAxis } from './line-axis';
import {
  sampleToPointIndex,
  SMOOTH_SAMPLES_PER_SEGMENT,
  smoothSamples,
} from './smooth-line';
import { dashboardText as copy } from '@/features/dashboard/labels';

export type LinePoint = {
  label: string;
  detailLabel?: string;
  secondaryDetailLabel?: string;
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
  height?: number;
  curved?: boolean;
  compact?: boolean;
  secondaryDashed?: boolean;
  fillPrimary?: boolean;
};

export function TrendLineChart({
  points,
  primaryColor,
  primaryLabel,
  secondaryColor,
  secondaryLabel,
  height,
  curved = true,
  compact,
  secondaryDashed = false,
  fillPrimary = false,
}: Props) {
  const theme = useTheme();
  const { width: windowW } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const signature = `${primaryLabel}:${JSON.stringify(points)}`;
  const [selection, setSelection] = useState<{
    signature: string;
    index: number;
  } | null>(null);
  if (points.length === 0) return <ChartEmpty />;
  const selectedIndex =
    selection?.signature === signature ? selection.index : points.length - 1;
  const selected = points[selectedIndex]!;

  const axisStyle = { color: theme.colors.textSecondary, fontSize: 10 };

  // 纵轴贴合数据范围（元）：双序列的 min/max。当最小值占最大值比例较大
  // （典型如净资产累计线，值都很大且彼此接近）时用 yAxisOffset 抬下限，
  // 折线充满图表高度；否则维持 0 锚（收支趋势按日补零 → min=0）。
  const vals: number[] = [];
  for (const p of points) {
    vals.push(p.primary / 100);
    if (p.secondary != null) vals.push(p.secondary / 100);
  }
  if (fillPrimary) vals.push(0);
  const hasSecondary = points.some((p) => p.secondary !== undefined);
  // 平滑走自算的单调三次插值：重采样成密集折线后交给库只画折线。
  // 库内 `curved`（Catmull-Rom 三次贝塞尔）会过冲，把贴近 0 的序列画到负值以下。
  const seriesCount = curved ? SMOOTH_SAMPLES_PER_SEGMENT : 1;
  const primaryDense = smoothSamples(
    points.map((p) => p.primary / 100),
    seriesCount,
  );
  const secondaryDense = hasSecondary
    ? smoothSamples(
        points.map((p) => (p.secondary ?? 0) / 100),
        seriesCount,
      )
    : null;
  // 少于 3 个点（或 curved=false）时不重采样，此时每个下标都是原始点
  const factor = primaryDense.length === points.length ? 1 : seriesCount;
  // Keep a conservative 64px horizontal inset that fits both dashboard and asset cards.
  const yAxisLabelWidth = compact ? 0 : 48;
  const sideSpacing = 20;
  const containerWidth = measuredWidth ?? windowW - 64;
  const plotWidth = containerWidth - yAxisLabelWidth;
  // Every history bucket must fit, including the latest balance, on first render.
  const spacing = (plotWidth - sideSpacing * 2) / Math.max(primaryDense.length, 1);
  const pointSpacing = spacing * factor;
  const labelCount = Math.min(points.length, 6);
  const labelIndexes = new Set(
    Array.from({ length: labelCount }, (_, index) =>
      labelCount === 1
        ? 0
        : Math.round((index * (points.length - 1)) / (labelCount - 1)),
    ),
  );
  const xAxisLabelWidth = 38;
  const data = primaryDense.map((value, index) => {
    const pointIndex = index / factor;
    const isRealPoint = Number.isInteger(pointIndex);
    const point = points[pointIndex] ?? points[points.length - 1]!;
    const showLabel =
      !compact && isRealPoint && labelIndexes.has(pointIndex);
    return {
      value,
      source: point,
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
                  marginLeft: (pointSpacing - xAxisLabelWidth) / 2,
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
  const data2 = secondaryDense
    ? secondaryDense.map((value, index) => ({
        value,
        source: points[sampleToPointIndex(index, points.length, factor)]!,
      }))
    : undefined;
  const axis = lineAxis(vals);
  // The chart library adds the negative area below its configured positive height.
  const positiveHeight =
    ((height ?? 200) * axis.noOfSections) /
    (axis.noOfSections + axis.noOfSectionsBelowXAxis);

  return (
    <View
      onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
    >
      {!compact && (
        <View style={styles.legend}>
          <View style={[styles.dot, { backgroundColor: primaryColor }]} />
          <Text
            style={[styles.legendText, { color: theme.colors.textSecondary }]}
          >
            {primaryLabel}
          </Text>
          {hasSecondary && secondaryColor && secondaryLabel ? (
            <>
              <View
                style={
                  secondaryDashed
                    ? {
                        width: 18,
                        borderTopWidth: 2,
                        borderColor: secondaryColor,
                        borderStyle: 'dashed',
                        marginLeft: 8,
                      }
                    : [styles.dot, { backgroundColor: secondaryColor }]
                }
              />
              <Text
                style={[
                  styles.legendText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {secondaryLabel}
              </Text>
            </>
          ) : null}
        </View>
      )}
      <LineChart
        key={signature}
        height={positiveHeight}
        width={plotWidth}
        disableScroll
        data={data}
        data2={data2}
        color1={primaryColor}
        color2={secondaryColor}
        strokeDashArray2={secondaryDashed ? [5, 4] : undefined}
        thickness={2}
        curved={false}
        hideDataPoints
        spacing={spacing}
        initialSpacing={sideSpacing}
        endSpacing={sideSpacing}
        {...axis}
        focusEnabled={!compact}
        focusTogether
        showStripOnFocus
        showDataPointOnFocus
        unFocusOnPressOut={false}
        focusedDataPointIndex={compact ? undefined : selectedIndex * factor}
        onFocus={(_item: unknown, index: number) =>
          setSelection({
            signature,
            index: sampleToPointIndex(index, points.length, factor),
          })
        }
        stripColor={theme.colors.textSecondary}
        stripOpacity={0.25}
        rulesLength={plotWidth}
        xAxisLength={plotWidth}
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
        areaChart1={fillPrimary || compact}
        areaChart2={false}
        startFillColor1={primaryColor}
        endFillColor1={primaryColor}
        startOpacity1={0.14}
        endOpacity1={0.01}
        startFillColor={primaryColor}
        endFillColor={primaryColor}
        startOpacity={0.22}
        endOpacity={0}
        formatYLabel={(v) => formatCompactYuan(Number(v))}
      />
      {!compact && (
        <View
          accessibilityLiveRegion="polite"
          style={{ paddingTop: 10, gap: 4 }}
        >
          <Text style={{ color: theme.colors.textSecondary, fontSize: 11 }}>
            {selected.secondaryDetailLabel
              ? `${primaryLabel} ${selected.detailLabel ?? selected.label} · ${secondaryLabel} ${selected.secondaryDetailLabel}`
              : `${selected.detailLabel ?? selected.label} · ${copy.choosePoint}`}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Text style={{ color: primaryColor, fontSize: 12 }}>
              {primaryLabel} {formatCentsWithSymbol(selected.primary)}
            </Text>
            {selected.secondary != null && (
              <Text style={{ color: secondaryColor, fontSize: 12 }}>
                {secondaryLabel} {formatCentsWithSymbol(selected.secondary)}
              </Text>
            )}
          </View>
        </View>
      )}
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
