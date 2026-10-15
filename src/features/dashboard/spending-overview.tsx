import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { useBudgetStatus } from '@/features/budgets';
import { useCategoryBreakdown } from '@/features/stats/hooks';
import type { CategorySlice } from '@/features/stats/repository';
import { spendingDriver } from '@/features/stats/spending-comparison';
import { useTransactionTotals } from '@/features/transactions/hooks';
import { amountChange } from '@/lib/analytics-range';
import { dayjs } from '@/lib/date';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';
import { Amount, dashboardStyles, QueryNotice } from './components';
import { dashboardText as copy } from './labels';
import type { usePeriod } from './use-period';

export function SpendingOverview({
  period,
  onTransactions,
  onCategory,
}: {
  period: ReturnType<typeof usePeriod>;
  onTransactions: (type: 'expense' | 'income') => void;
  onCategory: (category: CategorySlice) => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { range, comparison, selection } = period;
  const totals = useTransactionTotals({ range });
  const previous = useTransactionTotals({ range: comparison });
  const categories = useCategoryBreakdown(range, 'expense');
  const previousCategories = useCategoryBreakdown(comparison, 'expense');
  const budget = useBudgetStatus(selection.period, selection.key);
  const driver =
    categories.data && previousCategories.data
      ? spendingDriver(categories.data, previousCategories.data)
      : null;
  const change =
    totals.data && previous.data
      ? amountChange(totals.data.expense, previous.data.expense)
      : null;
  const totalBudget = budget.data?.total;
  const remaining = totalBudget ? totalBudget.amount - totalBudget.spent : null;
  const comparisonStart = dayjs(comparison.start).format(
    comparison.start.slice(0, 4) === range.start.slice(0, 4)
      ? 'MM.DD'
      : 'YYYY.MM.DD',
  );
  return (
    <View style={{ gap: 12 }}>
      <View style={dashboardStyles.between}>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
          {copy.periodExpense}
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 10,
            flexShrink: 1,
            textAlign: 'right',
          }}
        >
          {dayjs(range.start).format('MM.DD')}—
          {dayjs(range.end).format('MM.DD')}
          {' · '}
          {copy.versus} {comparisonStart}—
          {dayjs(comparison.end).format('MM.DD')}
        </Text>
      </View>
      <QueryNotice queries={[totals, previous]} />
      {totals.data && change && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${copy.periodExpense} ${copy.details}`}
            onPress={() => onTransactions('expense')}
          >
            <Text
              selectable
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[
                dashboardStyles.number,
                { color: colors.text, fontSize: 36, letterSpacing: -0.8 },
              ]}
            >
              {formatCentsWithSymbol(totals.data.expense)}
            </Text>
            <Text
              style={{
                color: change.delta > 0 ? colors.expense : colors.textSecondary,
                fontSize: 12,
                marginTop: 3,
              }}
            >
              {change.delta === 0
                ? copy.sameSpending
                : `${change.percent === null ? copy.newExpense : copy.versusPrevious} ${change.delta > 0 ? '+' : ''}${formatCentsWithSymbol(change.delta)}${change.percent === null ? '' : ` (${change.percent > 0 ? '+' : ''}${change.percent}%)`}`}
            </Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 24 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${copy.income} ${copy.details}`}
              onPress={() => onTransactions('income')}
              style={{ flex: 1 }}
            >
              <Amount label={copy.income} value={totals.data.income} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Amount
                label={copy.surplus}
                value={totals.data.income - totals.data.expense}
              />
            </View>
          </View>
        </>
      )}
      <QueryNotice queries={[budget]} />
      {budget.data && (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: '/budgets', params: selection })
          }
          style={{ minHeight: 44, justifyContent: 'center', gap: 7 }}
        >
          <View style={dashboardStyles.between}>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
              {remaining === null
                ? copy.budgetSetup
                : remaining < 0
                  ? copy.overBudget
                  : copy.budgetLeft}
              {remaining !== null &&
                ` ${formatCentsWithSymbol(Math.abs(remaining))}`}
            </Text>
            <Text
              style={{
                color:
                  remaining !== null && remaining < 0
                    ? colors.expense
                    : colors.textSecondary,
                fontSize: 11,
              }}
            >
              {totalBudget ? `${copy.usedBudget} ${totalBudget.pct}%` : '›'}
            </Text>
          </View>
          {totalBudget && (
            <View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: 4,
                  width: `${Math.min(100, totalBudget.pct)}%`,
                  backgroundColor:
                    totalBudget.pct >= 100 ? colors.expense : colors.primary,
                }}
              />
            </View>
          )}
        </Pressable>
      )}
      <QueryNotice queries={[categories, previousCategories]} />
      {driver && (
        <Pressable
          accessibilityRole="button"
          onPress={() => onCategory(driver.category)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            minHeight: 44,
            paddingHorizontal: 12,
            paddingVertical: 9,
            backgroundColor: colors.card,
            borderRadius: 10,
          }}
        >
          <View
            style={{
              width: 3,
              alignSelf: 'stretch',
              backgroundColor: driver.category.color,
              borderRadius: 2,
            }}
          />
          <Text
            style={{
              flex: 1,
              fontSize: 12,
              lineHeight: 19,
              color: colors.text,
            }}
          >
            <Text style={{ color: colors.textSecondary }}>
              {copy.mainChange} ·{' '}
            </Text>
            {driver.category.name}{' '}
            {driver.delta > 0 ? copy.increased : copy.decreased}{' '}
            {formatCentsWithSymbol(Math.abs(driver.delta))}
          </Text>
          <Icon name="chevron-right" size={14} color={colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}
