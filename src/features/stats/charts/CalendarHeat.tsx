import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { zh } from '@/i18n/zh';
import { dayjs } from '@/lib/date';
import { formatCentsWithSymbol, formatCompactCents } from '@/lib/money';
import { useTheme } from '@/theme';
import { heatLevel } from '../transform';
import { dashboardChartLayout } from './chart-layout';

export type HeatDay = {
  dateKey: string;
  expense: number;
  income: number;
};

type Props = {
  monthKey: string;
  cells: HeatDay[];
};

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const TOOLTIP_WIDTH = 168;
const TOOLTIP_HEIGHT = 68;
const TOOLTIP_OFFSET = 6;

export function CalendarHeat({ monthKey, cells }: Props) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [monthKey]);

  const activityByDay = useMemo(
    () => new Map(cells.map((cell) => [cell.dateKey, cell])),
    [cells],
  );
  const maxExpense = useMemo(
    () => cells.reduce((max, cell) => Math.max(max, cell.expense), 0),
    [cells],
  );

  const first = dayjs(`${monthKey}-01`);
  const daysInMonth = first.daysInMonth();
  const offset = (first.day() + 6) % 7;
  const rows = Math.ceil((offset + daysInMonth) / 7);
  const gap = dashboardChartLayout.calendarGap;
  const width = Math.min(windowWidth - 64, 360);
  const cellSize = Math.floor((width - gap * 6) / 7);

  const levelColors = [
    // 无记录日与卡片同色，避免深色主题下出现突兀的黑色格子
    theme.colors.card,
    `${theme.colors.expense}12`,
    `${theme.colors.expense}1F`,
    `${theme.colors.expense}2E`,
    `${theme.colors.expense}40`,
  ];

  const selectedCell = selected
    ? (activityByDay.get(selected) ?? { dateKey: selected, expense: 0, income: 0 })
    : null;
  const selectedDay = selected ? Number(selected.slice(-2)) : null;
  const selectedIndex = selectedDay === null ? null : offset + selectedDay - 1;
  const selectedColumn = selectedIndex === null ? 0 : selectedIndex % 7;
  const selectedRow = selectedIndex === null ? 0 : Math.floor(selectedIndex / 7);
  const selectedCenterX = selectedColumn * (cellSize + gap) + cellSize / 2;
  const tooltipLeft = Math.max(
    0,
    Math.min(selectedCenterX - TOOLTIP_WIDTH / 2, width - TOOLTIP_WIDTH),
  );
  const tooltipTop =
    selectedRow >= Math.ceil(rows / 2)
      ? selectedRow * (cellSize + gap) - TOOLTIP_HEIGHT - TOOLTIP_OFFSET
      : (selectedRow + 1) * (cellSize + gap) + TOOLTIP_OFFSET;

  return (
    <View style={styles.wrap}>
      <View style={[styles.weekdays, { gap, width }]}>
        {WEEKDAYS.map((weekday) => (
          <Text
            key={weekday}
            allowFontScaling={false}
            style={[styles.weekday, { color: theme.colors.textSecondary, width: cellSize }]}
          >
            {weekday}
          </Text>
        ))}
      </View>

      <View style={[styles.grid, { gap, width }]}>
        {Array.from({ length: offset }, (_, index) => (
          <View key={`empty-${index}`} style={{ height: cellSize, width: cellSize }} />
        ))}

        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const dateKey = first.date(day).format('YYYY-MM-DD');
          const activity = activityByDay.get(dateKey);
          const expense = activity?.expense ?? 0;
          const income = activity?.income ?? 0;
          const level = heatLevel(expense, maxExpense);
          const isSelected = selected === dateKey;

          return (
            <Pressable
              key={dateKey}
              accessibilityLabel={`${dateKey}, ${zh.tx.expense} ${formatCentsWithSymbol(expense)}, ${zh.tx.income} ${formatCentsWithSymbol(income)}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              android_ripple={{ color: `${theme.colors.primary}20`, borderless: false }}
              onPress={() => setSelected((current) => (current === dateKey ? null : dateKey))}
              style={[
                styles.cell,
                {
                  backgroundColor: levelColors[level],
                  borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                  height: cellSize,
                  width: cellSize,
                },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.day, { color: theme.colors.text }]}
              >
                {day}
              </Text>
              <Text
                adjustsFontSizeToFit
                allowFontScaling={false}
                minimumFontScale={0.72}
                numberOfLines={1}
                style={[styles.amount, { color: theme.colors.expense }]}
              >
                {expense > 0 ? `-${formatCompactCents(expense)}` : ' '}
              </Text>
              <Text
                adjustsFontSizeToFit
                allowFontScaling={false}
                minimumFontScale={0.72}
                numberOfLines={1}
                style={[styles.amount, { color: theme.colors.income }]}
              >
                {income > 0 ? `+${formatCompactCents(income)}` : ' '}
              </Text>
            </Pressable>
          );
        })}

        {selectedCell ? (
          <View
            pointerEvents="none"
            style={[
              styles.tooltip,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                left: tooltipLeft,
                top: tooltipTop,
              },
            ]}
          >
            <Text style={[styles.tooltipDate, { color: theme.colors.text }]}>
              {dayjs(selectedCell.dateKey).format('M月D日')}
            </Text>
            <View style={styles.tooltipRow}>
              <Text style={[styles.tooltipLabel, { color: theme.colors.expense }]}>
                {zh.tx.expense}
              </Text>
              <Text style={[styles.tooltipAmount, { color: theme.colors.text }]}>
                {formatCentsWithSymbol(selectedCell.expense)}
              </Text>
            </View>
            <View style={styles.tooltipRow}>
              <Text style={[styles.tooltipLabel, { color: theme.colors.income }]}>
                {zh.tx.income}
              </Text>
              <Text style={[styles.tooltipAmount, { color: theme.colors.text }]}>
                {formatCentsWithSymbol(selectedCell.income)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  weekdays: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  weekday: {
    fontSize: 10,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    position: 'relative',
  },
  cell: {
    alignItems: 'center',
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 2,
  },
  day: {
    fontSize: 9,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 11,
  },
  amount: {
    fontSize: 7.5,
    fontVariant: ['tabular-nums'],
    lineHeight: 9,
    textAlign: 'center',
    width: '100%',
  },
  tooltip: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    height: TOOLTIP_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 10,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    width: TOOLTIP_WIDTH,
    zIndex: 10,
  },
  tooltipDate: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 3,
  },
  tooltipRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tooltipLabel: {
    fontSize: 11,
  },
  tooltipAmount: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});
