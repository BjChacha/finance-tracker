import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { useFloatingTabBarInset } from '@/components/navigation/floating-tab-bar';
import {
  Amount,
  Card,
  dashboardStyles,
  QueryNotice,
  TextAction,
} from '@/features/dashboard/components';
import { AddTransactionButton } from '@/features/dashboard/add-transaction-button';
import { dashboardText as copy } from '@/features/dashboard/labels';
import { formatDayHeader } from '@/lib/date';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTodayKey } from '@/lib/use-today-key';
import { useTheme } from '@/theme';
import { TRANSFER_FEES_ID, type TxFilters } from '../filters';
import {
  useDaySummary,
  useTransactionDailyTotals,
  useTransactionPages,
} from '../hooks';
import {
  aggregateLedger,
  buildLedgerItems,
  type LedgerItem,
} from '../ledger-model';
import { TransactionRow } from './TransactionRow';

export function LedgerScreen({
  filters,
  tab = false,
  invalid = false,
}: {
  filters: TxFilters;
  tab?: boolean;
  invalid?: boolean;
}) {
  const { colors } = useTheme();
  const today = useTodayKey();
  const tabInset = useFloatingTabBarInset();
  const pages = useTransactionPages(filters, !invalid);
  const totals = useTransactionDailyTotals(filters, !invalid);
  const todaySummary = useDaySummary(today);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(
    () => [
      ...new Map(
        (pages.data?.pages.flatMap((page) => page.items) ?? []).map((row) => [
          row.id,
          row,
        ]),
      ).values(),
    ],
    [pages.data],
  );
  const { summary, groups } = useMemo(
    () => aggregateLedger(totals.data ?? []),
    [totals.data],
  );
  const items = useMemo(
    () => buildLedgerItems(rows, groups, collapsed),
    [rows, groups, collapsed],
  );
  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const loadNext = () => {
    if (pages.hasNextPage && !pages.isFetchingNextPage && !pages.isError)
      void pages.fetchNextPage();
  };
  const feeOnly =
    filters.categoryId === TRANSFER_FEES_ID || filters.type === 'expense';
  const ready =
    !invalid && !totals.isPending && !totals.isError && !pages.isPending;
  const renderItem = ({ item }: { item: LedgerItem }) => {
    if (item.kind === 'transaction')
      return (
        <View
          style={{
            marginHorizontal: 16,
            paddingHorizontal: 14,
            backgroundColor: colors.card,
          }}
        >
          {item.transaction.dateKey > today && (
            <Text
              style={{
                fontSize: 11,
                color: colors.textSecondary,
                paddingTop: 8,
              }}
            >
              {copy.future}
            </Text>
          )}
          <TransactionRow
            tx={item.transaction}
            expenseContribution={feeOnly}
            showBaseAmount
          />
        </View>
      );
    const title = item.kind === 'day' ? formatDayHeader(item.key) : item.key;
    return (
      <Pressable
        accessibilityRole={item.kind === 'day' ? 'header' : 'button'}
        accessibilityState={
          item.kind === 'day' ? undefined : { expanded: !item.collapsed }
        }
        disabled={item.kind === 'day'}
        onPress={() => toggle(item.key)}
        style={{
          paddingHorizontal: 20,
          paddingVertical: item.kind === 'day' ? 10 : 14,
          backgroundColor:
            item.kind === 'year' ? colors.card : colors.background,
          gap: 5,
        }}
      >
        <View style={dashboardStyles.between}>
          <View style={dashboardStyles.row}>
            {item.kind !== 'day' && (
              <Icon
                name={item.collapsed ? 'chevron-right' : 'chevron-down'}
                size={16}
                color={colors.textSecondary}
              />
            )}
            <Text
              style={{
                color: colors.text,
                fontWeight: item.kind === 'day' ? '400' : '600',
                fontSize: item.kind === 'year' ? 17 : 13,
              }}
            >
              {title}
            </Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {item.count} {copy.count}
          </Text>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
          {copy.expense} {formatCentsWithSymbol(item.expense)} · {copy.income}{' '}
          {formatCentsWithSymbol(item.income)}
        </Text>
      </Pressable>
    );
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlashList
        data={ready ? items : []}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.kind}-${item.key}`}
        getItemType={(item) => item.kind}
        onEndReached={loadNext}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ paddingBottom: tab ? tabInset + 80 : 32 }}
        ListHeaderComponent={
          <View style={dashboardStyles.content}>
            {tab && (
              <Card title={copy.today}>
                <QueryNotice queries={[todaySummary]} />
                {todaySummary.data && (
                  <View style={dashboardStyles.row}>
                    <Amount
                      label={copy.todayIncome}
                      value={todaySummary.data.income}
                      color={colors.income}
                    />
                    <Amount
                      label={copy.todayExpense}
                      value={todaySummary.data.expense}
                      color={colors.expense}
                    />
                    <Amount
                      label={copy.todayNet}
                      value={
                        todaySummary.data.income - todaySummary.data.expense
                      }
                    />
                  </View>
                )}
              </Card>
            )}
            {invalid ? (
              <Text accessibilityRole="alert" style={{ color: colors.expense }}>
                {copy.invalidFilter}
              </Text>
            ) : (
              <>
                <QueryNotice queries={[totals, pages]} />
                {ready && (
                  <Card title={`${summary.count} ${copy.count}`}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {filters.range
                        ? `${filters.range.start} — ${filters.range.end}`
                        : copy.unfiltered}
                    </Text>
                    <View style={dashboardStyles.row}>
                      {filters.type !== 'expense' &&
                        filters.categoryId !== TRANSFER_FEES_ID && (
                          <Amount
                            label={copy.totalIncome}
                            value={summary.income}
                            color={colors.income}
                          />
                        )}
                      {filters.type !== 'income' && (
                        <Amount
                          label={copy.totalExpense}
                          value={summary.expense}
                          color={colors.expense}
                        />
                      )}
                      {!filters.type && !filters.categoryId && (
                        <Amount
                          label={copy.surplus}
                          value={summary.income - summary.expense}
                        />
                      )}
                    </View>
                  </Card>
                )}
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          ready && !pages.isError ? (
            <Text
              style={{
                textAlign: 'center',
                color: colors.textSecondary,
                padding: 24,
              }}
            >
              {copy.noTransactions}
            </Text>
          ) : null
        }
        ListFooterComponent={
          pages.hasNextPage && !invalid ? (
            <View style={{ alignItems: 'center', padding: 16 }}>
              <TextAction
                label={pages.isFetchingNextPage ? copy.loading : copy.loadMore}
                onPress={loadNext}
              />
            </View>
          ) : null
        }
      />
      {tab && <AddTransactionButton bottom={tabInset + 8} />}
    </View>
  );
}
