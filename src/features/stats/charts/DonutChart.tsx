import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { formatAdaptiveCentsWithSymbol, formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';
import { ChartEmpty } from './ChartEmpty';
import { buildDonutSlices, OTHER_SLICE_ID, type DonutSlice } from './donut-data';
import { dashboardText as copy } from '@/features/dashboard/labels';

export type { DonutSlice } from './donut-data';

type Props = { data: DonutSlice[]; centerLabel: string; onDetails?: (id: string) => void };

export function DonutChart({ data, centerLabel, onDetails }: Props) {
  const { colors } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const slices = useMemo(() => buildDonutSlices(data, colors.textSecondary), [data, colors.textSecondary]);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const selected = slices.find((slice) => slice.id === selectedId);
  useEffect(() => { setSelectedId(null); }, [data]);
  const select = (id: string) => setSelectedId((current) => current === id ? null : id);
  const visibleIds = new Set(slices.map((slice) => slice.id));
  const remainder = data.filter((slice) => !visibleIds.has(slice.id) && slice.value > 0)
    .sort((a, b) => b.value - a.value);
  if (total <= 0) return <ChartEmpty />;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignItems: 'center' }} accessible accessibilityRole="image"
        accessibilityLabel={`${centerLabel} ${formatCentsWithSymbol(total)}`}>
        <PieChart donut radius={78} innerRadius={57} extraRadius={0}
          paddingHorizontal={0} paddingVertical={0} innerCircleColor={colors.card}
          data={slices.map((slice) => ({ value: slice.value,
            color: selected && selected.id !== slice.id ? colors.border : slice.color,
            onPress: () => select(slice.id) }))}
          centerLabelComponent={() => (
            <View style={{ width: 108, alignItems: 'center', gap: 4 }}>
              <Text numberOfLines={2} style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>{selected?.label ?? centerLabel}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}
                accessibilityLabel={formatCentsWithSymbol(selected?.value ?? total)}>
                {formatAdaptiveCentsWithSymbol(selected?.value ?? total)}
              </Text>
              {selected ? <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{selected.pct}%</Text> : null}
            </View>
          )}
        />
      </View>
      <View style={styles.legend}>
        {slices.map((slice) => (
          <Pressable key={slice.id} accessibilityRole="button" accessibilityState={{ selected: selectedId === slice.id }}
            accessibilityLabel={`${slice.label} ${formatCentsWithSymbol(slice.value)} ${slice.pct}%`}
            onPress={() => select(slice.id)} style={[styles.item, { borderColor: selectedId === slice.id ? slice.color : colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: slice.color }} />
              <Text style={{ color: colors.text, fontSize: 12, flex: 1 }}>{slice.label}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{slice.pct}%</Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 14 }}>{formatCentsWithSymbol(slice.value)}</Text>
          </Pressable>
        ))}
      </View>
      {selected && selected.id !== OTHER_SLICE_ID && onDetails && <Pressable accessibilityRole="button"
        onPress={() => onDetails(selected.id)} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.primary, fontWeight: '600' }}>{selected.label} · {copy.details}</Text>
      </Pressable>}
      {selectedId === OTHER_SLICE_ID ? remainder.map((slice) => (
        <Pressable key={slice.id} accessibilityRole="button" onPress={() => onDetails?.(slice.id)}
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 44 }}>
          <Text style={{ color: colors.textSecondary, flex: 1, fontSize: 12 }}>{slice.label}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{formatCentsWithSymbol(slice.value)} · {Math.round(slice.value / total * 1000) / 10}%</Text>
        </Pressable>
      )) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  item: { width: '49%', minHeight: 48, padding: 6, gap: 3, borderWidth: 1, borderRadius: 8 },
});
