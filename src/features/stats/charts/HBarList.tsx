import { StyleSheet, Text, View } from 'react-native';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';
import { ChartEmpty } from './ChartEmpty';
import { dashboardChartLayout } from './chart-layout';

export type HBarItem = {
  id: string;
  name: string;
  icon?: string;
  color: string;
  /** 分 */
  total: number;
  /** 占比 % */
  pct: number;
};

type Props = { items: HBarItem[] };

/** 水平条列表（纯 View 自绘），用于账户分布/分类排行 */
export function HBarList({ items }: Props) {
  const theme = useTheme();
  if (items.length === 0) return <ChartEmpty />;
  const max = Math.max(...items.map((i) => i.total), 1);

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <View key={item.id}>
          <View style={styles.row}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color, marginRight: 6 }} />
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.pct, { color: theme.colors.textSecondary }]}>{item.pct}%</Text>
            <Text style={[styles.amount, { color: theme.colors.text }]}>
              {formatCentsWithSymbol(item.total)}
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: item.color,
                  width: `${Math.max((item.total / max) * 100, 2)}%`,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: dashboardChartLayout.rankGap },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  name: { flex: 1, fontSize: 14 },
  pct: { fontSize: 12, width: 52, textAlign: 'right' },
  amount: { fontSize: 13, fontVariant: ['tabular-nums'], minWidth: 84, textAlign: 'right' },
  track: {
    height: dashboardChartLayout.rankTrackHeight,
    borderRadius: dashboardChartLayout.rankTrackHeight / 2,
    overflow: 'hidden',
  },
  fill: {
    height: dashboardChartLayout.rankTrackHeight,
    borderRadius: dashboardChartLayout.rankTrackHeight / 2,
  },
});
