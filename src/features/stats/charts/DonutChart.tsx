import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';
import { ChartEmpty } from './ChartEmpty';

export type DonutSlice = {
  id: string;
  label: string;
  /** 分 */
  value: number;
  color: string;
  icon?: string;
  /** 占比 % */
  pct: number;
};

type Props = {
  data: DonutSlice[];
  /** 中心标题，如"总支出" */
  centerLabel: string;
  onSlicePress?: (id: string) => void;
};

/** 环形占比图 + 图例列表（隔离 gifted-charts） */
export function DonutChart({ data, centerLabel, onSlicePress }: Props) {
  const theme = useTheme();
  const total = data.reduce((s, d) => s + d.value, 0);
  if (data.length === 0 || total <= 0) return <ChartEmpty />;

  const pieData = data.map((d) => ({
    value: d.value,
    color: d.color,
    onPress: () => onSlicePress?.(d.id),
  }));

  return (
    <View>
      <View style={styles.pieWrap}>
        <PieChart
          data={pieData}
          donut
          radius={92}
          innerRadius={62}
          innerCircleColor={theme.colors.card}
          centerLabelComponent={() => (
            <View style={styles.center}>
              <Text style={[styles.centerLabel, { color: theme.colors.textSecondary }]}>
                {centerLabel}
              </Text>
              <Text style={[styles.centerValue, { color: theme.colors.text }]}>
                {formatCentsWithSymbol(total)}
              </Text>
            </View>
          )}
        />
      </View>
      <View style={styles.legend}>
        {data.map((d) => (
          <Pressable
            key={d.id}
            style={styles.legendRow}
            onPress={() => onSlicePress?.(d.id)}
            disabled={!onSlicePress}
          >
            <View style={[styles.dot, { backgroundColor: d.color }]} />
            <Text style={[styles.legendName, { color: theme.colors.text }]} numberOfLines={1}>
              {d.icon ? `${d.icon} ` : ''}
              {d.label}
            </Text>
            <Text style={[styles.legendPct, { color: theme.colors.textSecondary }]}>{d.pct}%</Text>
            <Text style={[styles.legendAmount, { color: theme.colors.text }]}>
              {formatCentsWithSymbol(d.value)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pieWrap: { alignItems: 'center', paddingVertical: 8 },
  center: { alignItems: 'center' },
  centerLabel: { fontSize: 12 },
  centerValue: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  legend: { marginTop: 12, gap: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { flex: 1, fontSize: 14 },
  legendPct: { fontSize: 12, width: 52, textAlign: 'right' },
  legendAmount: { fontSize: 13, fontVariant: ['tabular-nums'], minWidth: 84, textAlign: 'right' },
});
