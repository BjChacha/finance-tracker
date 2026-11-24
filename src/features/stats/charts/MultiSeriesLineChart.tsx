import { useMemo, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/theme';
import { formatCentsWithSymbol, formatCompactYuan } from '@/lib/money';
import { ChartEmpty } from './ChartEmpty';
import { lineAxis } from './line-axis';
import { monotonePath, type Pt } from './smooth-line';

export type MultiSeries = { id: string; name: string; color: string };
export type MultiSeriesPoint = {
  label: string;
  detailLabel?: string;
  /** 与 series 一一对应（分）；隐藏的序列也在数组里，由 hiddenIds 决定画不画 */
  values: number[];
};

type Props = {
  series: MultiSeries[];
  points: MultiSeriesPoint[];
  height?: number;
  /** 被隐藏的序列 id */
  hiddenIds?: readonly string[];
  onToggleSeries?: (id: string) => void;
};

const MARGIN = { top: 12, right: 12, bottom: 26, left: 52 };
const MAX_X_LABELS = 6;

/**
 * 任意条数序列的折线图（自绘）。
 *
 * 为什么不用图表库：`react-native-gifted-charts` 的 LineChart 只接受
 * `data` / `data2` 两条序列，多序列是它的硬限制。这里用
 * {@link monotonePath}（单调三次 Hermite）直接产出 SVG 路径——
 * 顺带避开了库内 `curved` 在剧烈起伏时把贴近 0 的序列画到负值以下的过冲问题。
 *
 * 图例可点：多序列图的价值在于「对比哪几条」，能让用户关掉干扰项比看十条线更实用。
 */
export function MultiSeriesLineChart({
  series,
  points,
  height = 200,
  hiddenIds = [],
  onToggleSeries,
}: Props) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const visible = useMemo(
    () => series.filter((item) => !hiddenIds.includes(item.id)),
    [series, hiddenIds],
  );

  // 单位统一换成「元」：lineAxis 与 formatCompactYuan 都按元工作
  const axis = useMemo(() => {
    const yuan: number[] = [];
    for (const item of visible) {
      for (const point of points) {
        const value = point.values[series.indexOf(item)];
        if (value != null) yuan.push(value / 100);
      }
    }
    return lineAxis(yuan.length > 0 ? yuan : [0]);
  }, [points, series, visible]);

  const index = Math.min(
    Math.max(selectedIndex ?? points.length - 1, 0),
    Math.max(points.length - 1, 0),
  );

  if (points.length === 0 || series.length === 0) return <ChartEmpty />;

  const containerWidth = measuredWidth ?? windowWidth - 64;
  const innerW = Math.max(1, containerWidth - MARGIN.left - MARGIN.right);
  const innerH = Math.max(1, height - MARGIN.top - MARGIN.bottom);
  const span = Math.max(1e-6, axis.maxValue - axis.yAxisOffset);
  const yFor = (yuan: number) =>
    innerH - ((yuan - axis.yAxisOffset) / span) * innerH;
  const xFor = (at: number) =>
    points.length <= 1 ? innerW / 2 : (at * innerW) / (points.length - 1);

  const labelIndexes = new Set(
    Array.from({ length: Math.min(points.length, MAX_X_LABELS) }, (_, at) =>
      Math.min(points.length - 1, Math.round((at * (points.length - 1)) / Math.max(1, Math.min(points.length, MAX_X_LABELS) - 1))),
    ),
  );

  const gridValues = Array.from(
    { length: axis.noOfSections + 1 },
    (_, at) => axis.yAxisOffset + at * axis.stepValue,
  );

  const selected = points[index]!;

  const selectFromX = (locationX: number) => {
    if (points.length <= 1) return;
    const ratio = (locationX - MARGIN.left) / innerW;
    const at = Math.round(ratio * (points.length - 1));
    setSelectedIndex(Math.min(Math.max(at, 0), points.length - 1));
  };

  return (
    <View onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}>
      <View
        accessible
        accessibilityLabel={`分类趋势，共 ${visible.length} 条序列，${points.length} 个周期`}
      >
        <Svg width={containerWidth} height={height}>
          <Line
            x1={MARGIN.left}
            x2={MARGIN.left + innerW}
            y1={MARGIN.top}
            y2={MARGIN.top + innerH}
            stroke="transparent"
          />
          {/* 网格与 Y 轴刻度 */}
          {gridValues.map((value) => {
            const y = MARGIN.top + yFor(value);
            return (
              <Line
                key={`grid-${value}`}
                x1={MARGIN.left}
                x2={MARGIN.left + innerW}
                y1={y}
                y2={y}
                stroke={colors.border}
                strokeDasharray="4 4"
              />
            );
          })}
          {gridValues.map((value) => (
            <SvgText
              key={`ylabel-${value}`}
              x={MARGIN.left - 8}
              y={MARGIN.top + yFor(value) + 3.5}
              fontSize={10}
              fill={colors.textSecondary}
              textAnchor="end"
            >
              {formatCompactYuan(value)}
            </SvgText>
          ))}

          {/* 选中竖线 */}
          {points.length > 1 && (
            <Line
              x1={MARGIN.left + xFor(index)}
              x2={MARGIN.left + xFor(index)}
              y1={MARGIN.top}
              y2={MARGIN.top + innerH}
              stroke={colors.textSecondary}
              strokeOpacity={0.35}
              strokeDasharray="4 4"
            />
          )}

          {/* 每个序列 */}
          {visible.map((item) => {
            const seriesIndex = series.indexOf(item);
            const pts: Pt[] = points.map((point, at) => ({
              x: MARGIN.left + xFor(at),
              y: MARGIN.top + yFor((point.values[seriesIndex] ?? 0) / 100),
            }));
            return (
              <Path
                key={`line-${item.id}`}
                d={pts.length >= 2 ? monotonePath(pts) : ''}
                stroke={item.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
              />
            );
          })}

          {/* 数据点：周期少时逐点画，多了只画选中点 */}
          {visible.map((item) => {
            const seriesIndex = series.indexOf(item);
            const showAll = points.length <= 12;
            return points.map((point, at) => {
              if (!showAll && at !== index) return null;
              return (
                <Circle
                  key={`dot-${item.id}-${at}`}
                  cx={MARGIN.left + xFor(at)}
                  cy={MARGIN.top + yFor((point.values[seriesIndex] ?? 0) / 100)}
                  r={at === index ? 3.5 : 2.5}
                  fill={item.color}
                />
              );
            });
          })}

          {/* X 轴标签 */}
          {points.map((point, at) =>
            labelIndexes.has(at) ? (
              <SvgText
                key={`xlabel-${at}`}
                x={MARGIN.left + xFor(at)}
                y={height - 8}
                fontSize={10}
                fill={colors.textSecondary}
                textAnchor="middle"
              >
                {point.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
        {/* 触摸层：整块覆盖，按 x 取最近点 */}
        <Pressable
          accessibilityRole="adjustable"
          style={{ position: 'absolute', inset: 0 }}
          onPress={(event) => selectFromX(event.nativeEvent.locationX)}
        />
      </View>

      {/* 选中点读数 */}
      <View style={{ paddingTop: 8, gap: 3 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
          {selected.detailLabel ?? selected.label}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {visible.map((item) => {
            const seriesIndex = series.indexOf(item);
            return (
              <Text
                key={`read-${item.id}`}
                style={{ color: item.color, fontSize: 12 }}
              >
                {`${item.name} ${formatCentsWithSymbol(selected.values[seriesIndex] ?? 0)}`}
              </Text>
            );
          })}
        </View>
      </View>

      {/* 图例（可点隐藏） */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 12,
          paddingTop: 10,
        }}
      >
        {series.map((item) => {
          const hidden = hiddenIds.includes(item.id);
          return (
            <Pressable
              key={`legend-${item.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: !hidden }}
              accessibilityLabel={`${item.name}${hidden ? ' 已隐藏' : ''}`}
              disabled={!onToggleSeries || series.length <= 1}
              onPress={() => onToggleSeries?.(item.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                opacity: hidden ? 0.4 : 1,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: item.color,
                }}
              />
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {item.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
