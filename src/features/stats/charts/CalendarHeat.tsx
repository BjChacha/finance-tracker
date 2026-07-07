import { useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { dayjs } from '@/lib/date';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';
import { heatLevel } from '../transform';
import { ChartEmpty } from './ChartEmpty';

export type HeatDay = { dateKey: string; expense: number };

type Props = {
  /** 'YYYY-MM' */
  monthKey: string;
  /** 有支出的日期，单位分 */
  cells: HeatDay[];
};

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const GAP = 4;

/** 消费日历热力图：7 列月历格子，按支出深浅着色，点击查看当日金额 */
export function CalendarHeat({ monthKey, cells }: Props) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [selected, setSelected] = useState<string | null>(null);

  const expenseByDay = useMemo(() => new Map(cells.map((c) => [c.dateKey, c.expense])), [cells]);
  const max = cells.reduce((m, c) => Math.max(m, c.expense), 0);
  if (cells.length === 0 || max <= 0) return <ChartEmpty />;

  const first = dayjs(`${monthKey}-01`);
  const daysInMonth = first.daysInMonth();
  /** 周一为第一列 */
  const offset = (first.day() + 6) % 7;
  const rows = Math.ceil((offset + daysInMonth) / 7);

  const width = Math.min(windowWidth - 64, 360);
  const cell = Math.floor((width - GAP * 6) / 7);
  const height = rows * cell + (rows - 1) * GAP;

  const levelColors = [
    theme.dark ? '#292524' : '#E7E5E4',
    `${theme.colors.expense}40`,
    `${theme.colors.expense}73`,
    `${theme.colors.expense}B3`,
    theme.colors.expense,
  ];

  const selectedExpense = selected ? (expenseByDay.get(selected) ?? 0) : null;

  return (
    <View style={styles.wrap}>
      <View style={[styles.weekdays, { width }]}>
        {WEEKDAYS.map((w) => (
          <Text
            key={w}
            style={[styles.weekday, { color: theme.colors.textSecondary, width: cell }]}
          >
            {w}
          </Text>
        ))}
      </View>
      <Svg width={width} height={height}>
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateKey = first.date(day).format('YYYY-MM-DD');
          const idx = offset + i;
          const col = idx % 7;
          const row = Math.floor(idx / 7);
          const x = col * (cell + GAP);
          const y = row * (cell + GAP);
          const level = heatLevel(expenseByDay.get(dateKey) ?? 0, max);
          const isSelected = selected === dateKey;
          return (
            <Rect
              key={dateKey}
              x={x}
              y={y}
              width={cell}
              height={cell}
              rx={4}
              fill={levelColors[level]}
              stroke={isSelected ? theme.colors.primary : 'transparent'}
              strokeWidth={2}
              onPress={() => setSelected(isSelected ? null : dateKey)}
            />
          );
        })}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const idx = offset + i;
          const level = heatLevel(
            expenseByDay.get(first.date(day).format('YYYY-MM-DD')) ?? 0,
            max,
          );
          return (
            <SvgText
              key={day}
              x={(idx % 7) * (cell + GAP) + cell / 2}
              y={Math.floor(idx / 7) * (cell + GAP) + cell / 2 + 3.5}
              fontSize={10}
              textAnchor="middle"
              fill={level >= 3 ? '#FFFFFF' : theme.colors.textSecondary}
            >
              {String(day)}
            </SvgText>
          );
        })}
      </Svg>
      {selected !== null && selectedExpense !== null ? (
        <Text style={[styles.tooltip, { color: theme.colors.text }]}>
          {dayjs(selected).format('M月D日')} 支出 {formatCentsWithSymbol(selectedExpense)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  weekday: { fontSize: 11, textAlign: 'center' },
  tooltip: { marginTop: 10, fontSize: 13 },
});
