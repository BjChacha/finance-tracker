import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useFloatingTabBarInset } from '@/components/navigation/floating-tab-bar';
import { useCategoryBreakdown } from '@/features/stats/hooks';
import type { CategorySlice } from '@/features/stats/repository';
import { useLargestExpenses } from '@/features/transactions/hooks';
import { TransactionRow } from '@/features/transactions/components/TransactionRow';
import { transactionParams } from '@/features/transactions/filters';
import { useTheme } from '@/theme';
import { AddTransactionButton } from './add-transaction-button';
import { AssetSummary } from './asset-summary';
import { CategoryList } from './category-list';
import {
  dashboardStyles,
  PeriodControl,
  QueryNotice,
  Section,
  TextAction,
} from './components';
import { dashboardText as copy } from './labels';
import { SpendingOverview } from './spending-overview';
import { SpendingPace } from './spending-pace';
import { usePeriod } from './use-period';

export function DashboardScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const inset = useFloatingTabBarInset();
  const period = usePeriod();
  const { range, comparison, granularity, selection } = period;
  const categories = useCategoryBreakdown(range, 'expense');
  const previousCategories = useCategoryBreakdown(comparison, 'expense');
  const highlights = useLargestExpenses(range);
  const openTransactions = (type: 'expense' | 'income') =>
    router.push({
      pathname: '/transactions',
      params: transactionParams({ range, type }, copy[type]),
    });
  const openCategory = (item: CategorySlice) =>
    router.push({
      pathname: '/transactions',
      params: transactionParams(
        {
          range,
          type: 'expense',
          categoryId: item.categoryId,
          includeChildren: true,
        },
        item.name,
      ),
    });
  const openAnalysis = () =>
    router.push({ pathname: '/stats', params: selection });
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={[
          dashboardStyles.content,
          { paddingTop: 8, paddingBottom: inset + 80 },
        ]}
      >
        <PeriodControl {...period} compact />
        <SpendingOverview
          period={period}
          onTransactions={openTransactions}
          onCategory={openCategory}
        />
        <AssetSummary
          range={range}
          granularity={granularity}
          onPress={() =>
            router.push({ pathname: '/assets', params: selection })
          }
        />
        <Section
          title={copy.where}
          action={
            <TextAction label={copy.categoryAnalysis} onPress={openAnalysis} />
          }
        >
          <QueryNotice queries={[categories, previousCategories]} />
          {categories.data && previousCategories.data && (
            <CategoryList
              items={categories.data}
              previous={previousCategories.data}
              onPress={openCategory}
              showComposition
            />
          )}
        </Section>
        <SpendingPace
          range={range}
          comparison={comparison}
          granularity={granularity}
          onDetails={openAnalysis}
        />
        <Section title={copy.largeExpenses}>
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
            {copy.topExpensesHint}
          </Text>
          <QueryNotice queries={[highlights]} />
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 12,
              paddingHorizontal: 12,
              overflow: 'hidden',
            }}
          >
            {highlights.data?.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                tx={transaction}
                showBaseAmount
                expenseContribution
              />
            ))}
          </View>
          {highlights.data?.length === 0 && (
            <Text style={{ color: colors.textSecondary }}>
              {copy.emptyHighlights}
            </Text>
          )}
        </Section>
      </ScrollView>
      <AddTransactionButton bottom={inset + 8} />
    </View>
  );
}
