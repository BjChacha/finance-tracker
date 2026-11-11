import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { useFloatingTabBarInset } from '@/components/navigation/floating-tab-bar';
import { useCategoryBreakdown } from '@/features/stats/hooks';
import type { CategorySlice } from '@/features/stats/repository';
import { InsightsSection } from '@/features/insights';
import { useLargestExpenses } from '@/features/transactions/hooks';
import { LatestReportCard } from '@/features/reports/components/latest-report-card';
import { reportsText } from '@/features/reports/labels';
import { TransactionRow } from '@/features/transactions/components/TransactionRow';
import { transactionParams } from '@/features/transactions/filters';
import { useTheme } from '@/theme';
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
import {
  DEFAULT_LAYOUT,
  useDashboardLayout,
  type DashboardSectionKey,
} from './sections';
import { useDashboardPrefetch } from './prefetch';
import { SpendingOverview } from './spending-overview';
import { SpendingPace } from './spending-pace';
import { usePeriod } from './use-period';

export function DashboardScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const inset = useFloatingTabBarInset();
  const period = usePeriod(undefined, { withAll: true });
  const { range, comparison, granularity, selection, all, comparisonClamped } =
    period;
  // 空闲预取季/年/全部三代范围：切大范围时命中缓存，无加载等待
  useDashboardPrefetch();
  const comparable = comparison !== null;
  const layoutQuery = useDashboardLayout();
  const layout = layoutQuery.data ?? DEFAULT_LAYOUT;
  const visibleSections = useMemo(
    () => layout.order.filter((key) => !layout.hidden.includes(key)),
    [layout],
  );
  const sectionVisible = (key: DashboardSectionKey) =>
    visibleSections.includes(key);

  // 隐藏 = 不执行查询：被隐藏模块的查询 enabled=false，并非仅 CSS 隐藏
  const categories = useCategoryBreakdown(
    range,
    'expense',
    undefined,
    sectionVisible('categories'),
  );
  const previousCategories = useCategoryBreakdown(
    comparison ?? range,
    'expense',
    undefined,
    comparable && sectionVisible('categories'),
  );
  const highlights = useLargestExpenses(range, sectionVisible('highlights'));

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

  const renderSection = (key: DashboardSectionKey) => {
    switch (key) {
      case 'insights':
        return <InsightsSection key={key} />;
      case 'report':
        return (
          <Section
            key={key}
            title={reportsText.title}
            action={
              <TextAction
                label={reportsText.historyTitle}
                onPress={() => router.push('/reports')}
              />
            }
          >
            <LatestReportCard />
          </Section>
        );
      case 'assets':
        return (
          <AssetSummary
            key={key}
            range={range}
            granularity={granularity}
            onPress={() =>
              router.push({ pathname: '/assets', params: selection })
            }
          />
        );
      case 'categories':
        return (
          <Section
            key={key}
            title={copy.where}
            action={
              <TextAction
                label={copy.categoryAnalysis}
                onPress={openAnalysis}
              />
            }
          >
            <QueryNotice queries={[categories, previousCategories]} />
            {categories.data && (
              <CategoryList
                items={categories.data}
                previous={previousCategories.data}
                onPress={openCategory}
                showComposition
              />
            )}
          </Section>
        );
      case 'pace':
        /* 「全部时间」没有可比的上一个周期，消费节奏整块不展示 */
        return comparable ? (
          <SpendingPace
            key={key}
            range={range}
            comparison={comparison}
            granularity={granularity}
            onDetails={openAnalysis}
          />
        ) : null;
      case 'highlights':
        return (
          <Section key={key} title={copy.largeExpenses}>
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
        );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={[
          dashboardStyles.content,
          { paddingTop: 8, paddingBottom: inset + 80 },
        ]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <View style={{ flex: 1 }}>
            <PeriodControl
              {...period}
              compact
              allSelected={period.all}
              onSelectAll={() => period.setAll(true)}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.customize}
            onPress={() => router.push('/dashboard-settings')}
            style={{ padding: 8 }}
          >
            <Icon name="settings" size={18} color={colors.primary} />
          </Pressable>
        </View>
        {period.all && <QueryNotice queries={[period.allStart]} />}
        {!period.all || period.allStart.data ? (
          <>
            <SpendingOverview
              range={range}
              comparison={comparison}
              comparisonClamped={comparisonClamped}
              selection={selection}
              onTransactions={openTransactions}
              onCategory={openCategory}
            />
            {visibleSections.map(renderSection)}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
