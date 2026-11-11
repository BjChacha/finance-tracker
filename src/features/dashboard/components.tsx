import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Icon } from '@/components/Icon';
import { formatPeriodTitle, type BudgetPeriod } from '@/lib/date';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';
import type { PeriodSelection } from '@/lib/analytics-range';
import { dashboardText as copy } from './labels';

export const dashboardStyles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        gap: 10,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <View style={dashboardStyles.between}>
        <Text
          accessibilityRole="header"
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 17,
            fontWeight: '600',
          }}
        >
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        padding: 16,
        gap: 14,
        borderRadius: 16,
        backgroundColor: colors.card,
      }}
    >
      {(title || action) && (
        <View style={dashboardStyles.between}>
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              color: colors.text,
              fontSize: 16,
              fontWeight: '600',
            }}
          >
            {title}
          </Text>
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

export function TextAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}
    >
      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function PeriodControl({
  selection,
  setPeriod,
  shift,
  canNext,
  allSelected = false,
  onSelectAll,
  compact = false,
}: {
  selection: PeriodSelection;
  setPeriod: (period: BudgetPeriod) => void;
  shift: (delta: number) => void;
  canNext: boolean;
  allSelected?: boolean;
  onSelectAll?: () => void;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const options: (BudgetPeriod | 'allHistory')[] = ['month', 'quarter', 'year'];
  if (onSelectAll) options.push('allHistory');
  return (
    <View
      style={
        compact
          ? {
              // 自适应：◀ ▶ 块按内容宽度收缩，胶囊块占剩余宽度（有上下限），
              // 320dp 及以上单行放下；极窄屏/超大字体仍作为兜底允许换行（不重叠）
              flexDirection: 'row-reverse',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
            }
          : { gap: 8, flexDirection: 'column' }
      }
    >
      <View
        style={{
          flexDirection: 'row',
          padding: compact ? 2 : 4,
          borderRadius: 12,
          backgroundColor: colors.card,
          ...(compact
            ? { flexGrow: 1, flexShrink: 1, minWidth: 132, maxWidth: 220 }
            : null),
        }}
      >
        {options.map((period) => {
          const selected =
            period === 'allHistory'
              ? allSelected
              : !allSelected && selection.period === period;
          return (
            <Pressable
              key={period}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() =>
                period === 'allHistory' ? onSelectAll?.() : setPeriod(period)
              }
              style={{
                flex: 1,
                minHeight: compact ? 36 : 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 9,
                backgroundColor: selected
                  ? compact
                    ? colors.border
                    : colors.primary
                  : 'transparent',
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: selected
                    ? compact
                      ? colors.text
                      : colors.onPrimary
                    : colors.textSecondary,
                  fontWeight: '600',
                }}
              >
                {period === 'allHistory' ? copy.all : copy[period]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {!allSelected && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: compact ? 0 : 16,
            flexShrink: 1,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.previousPeriod}
            onPress={() => shift(-1)}
            style={{ padding: compact ? 10 : 12 }}
            hitSlop={compact ? { left: 2, right: 2 } : undefined}
          >
            <Icon name="chevron-left" color={colors.primary} size={20} />
          </Pressable>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              fontWeight: '600',
              fontSize: compact ? 12 : 15,
              color: colors.text,
              flexShrink: 1,
            }}
          >
            {formatPeriodTitle(selection.period, selection.key)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.nextPeriod}
            disabled={!canNext}
            accessibilityState={{ disabled: !canNext }}
            onPress={() => shift(1)}
            style={{ padding: compact ? 10 : 12 }}
            hitSlop={compact ? { left: 2, right: 2 } : undefined}
          >
            <Icon
              name="chevron-right"
              color={canNext ? colors.primary : colors.border}
              size={20}
            />
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function Amount({
  label,
  value,
  color,
  large = false,
}: {
  label: string;
  value: number;
  color?: string;
  large?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 5 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
      <Text
        selectable
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          dashboardStyles.number,
          { color: color ?? colors.text, fontSize: large ? 34 : 16 },
        ]}
      >
        {formatCentsWithSymbol(value)}
      </Text>
    </View>
  );
}

export function QueryNotice({
  queries,
}: {
  queries: {
    isPending: boolean;
    isError: boolean;
    refetch: () => unknown;
    /** React Query 会为被 `enabled: false` 关掉的查询保留 pending 状态，
     *  这里靠 fetchStatus 区分「在等数据」与「压根没发请求」 */
    fetchStatus?: string;
  }[];
}) {
  const { colors } = useTheme();
  const failed = queries.filter((query) => query.isError);
  if (failed.length)
    return (
      <View style={{ alignItems: 'center', padding: 20, gap: 8 }}>
        <Text accessibilityRole="alert" style={{ color: colors.expense }}>
          {copy.error}
        </Text>
        <TextAction
          label={copy.retry}
          onPress={() => failed.forEach((query) => void query.refetch())}
        />
      </View>
    );
  const loading = queries.some(
    (query) => query.isPending && query.fetchStatus !== 'idle',
  );
  if (loading)
    return (
      <View style={{ padding: 24, gap: 8 }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ textAlign: 'center', color: colors.textSecondary }}>
          {copy.loading}
        </Text>
      </View>
    );
  return null;
}
