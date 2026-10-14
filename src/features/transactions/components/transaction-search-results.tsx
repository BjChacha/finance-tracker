import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCallback, useMemo } from 'react';
import { Icon } from '@/components/Icon';
import { IconBubble } from '@/components/IconBubble';
import { zh } from '@/i18n/zh';
import { formatDayHeader, formatTime } from '@/lib/date';
import { resolveIconKey } from '@/lib/iconResolvers';
import { formatCents } from '@/lib/money';
import { useTheme, type AppTheme } from '@/theme';
import { useTransactionSearch } from '../hooks';
import type { TxListItem } from '../repository';

type SearchHeaderItem = { kind: 'header'; dateKey: string };
type SearchRowItem = { kind: 'row'; transaction: TxListItem };
type SearchListItem = SearchHeaderItem | SearchRowItem;

type TransactionSearchResultsProps = {
  query: string;
  displayQuery: string;
  isDebouncing: boolean;
  onPressInTransaction: (transaction: TxListItem) => void;
  onPressTransaction: (id: string) => void;
};

export function TransactionSearchResults({
  query,
  displayQuery,
  isDebouncing,
  onPressInTransaction,
  onPressTransaction,
}: TransactionSearchResultsProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const search = useTransactionSearch(query);
  const transactions = useMemo(
    () => search.data?.pages.flatMap((page) => page.items) ?? [],
    [search.data],
  );
  const listData = useMemo<SearchListItem[]>(() => {
    const items: SearchListItem[] = [];
    let currentDateKey = '';
    for (const transaction of transactions) {
      if (transaction.dateKey !== currentDateKey) {
        currentDateKey = transaction.dateKey;
        items.push({ kind: 'header', dateKey: currentDateKey });
      }
      items.push({ kind: 'row', transaction });
    }
    return items;
  }, [transactions]);

  const loadNextPage = useCallback(() => {
    if (!search.hasNextPage || search.isFetchingNextPage) return;
    void search.fetchNextPage();
  }, [search]);

  const renderItem = useCallback(
    ({ item }: { item: SearchListItem }) => {
      if (item.kind === 'header') {
        return (
          <View style={styles.dayHeader}>
            <Text style={styles.dayHeaderText}>{formatDayHeader(item.dateKey)}</Text>
          </View>
        );
      }

      const transaction = item.transaction;
      const isTransfer = transaction.type === 'transfer';
      const amountColor =
        transaction.type === 'expense'
          ? colors.expense
          : transaction.type === 'income'
            ? colors.income
            : colors.transfer;
      const categoryLabel = transaction.categoryName
        ? transaction.parentCategoryName
          ? `${transaction.parentCategoryName} › ${transaction.categoryName}`
          : transaction.categoryName
        : zh.common.empty;
      const title = isTransfer
        ? `${transaction.accountName ?? '?'} → ${transaction.toAccountName ?? '?'}`
        : categoryLabel;
      const subtitleParts: string[] = [];
      if (isTransfer) {
        subtitleParts.push(formatTime(transaction.date), categoryLabel);
      } else if (transaction.accountName) {
        subtitleParts.push(transaction.accountName);
      }
      if (transaction.projectName) subtitleParts.push(`${zh.tx.project}：${transaction.projectName}`);
      if (transaction.note) subtitleParts.push(transaction.note);
      const sign =
        transaction.type === 'expense' ? '-' : transaction.type === 'income' ? '+' : '';

      return (
        <Pressable
          accessibilityRole="button"
          style={styles.row}
          onPressIn={() => onPressInTransaction(transaction)}
          onPress={() => onPressTransaction(transaction.id)}
        >
          {isTransfer ? (
            <View style={styles.transferIcon}>
              <Icon name="arrow-left-right" size={22} color={colors.textSecondary} />
            </View>
          ) : (
            <IconBubble
              name={resolveIconKey(transaction.categoryIcon, 'category')}
              color={transaction.categoryColor ?? colors.primary}
              size={36}
            />
          )}
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {subtitleParts.join(' · ')}
            </Text>
          </View>
          <View style={styles.rowTrailing}>
            {!isTransfer && <Text style={styles.rowTime}>{formatTime(transaction.date)}</Text>}
            <Text style={[styles.rowAmount, { color: amountColor }]}>
              {sign}
              {formatCents(transaction.amount)}
            </Text>
          </View>
        </Pressable>
      );
    },
    [colors, onPressInTransaction, onPressTransaction, styles],
  );

  if (displayQuery.trim() === '') {
    return (
      <View style={styles.centerState}>
        <Icon name="search" size={30} color={colors.textSecondary} />
        <Text style={styles.stateTitle}>{zh.txList.searchHint}</Text>
        <Text style={styles.stateText}>{zh.txList.searchExamples}</Text>
      </View>
    );
  }

  if (isDebouncing || search.isPending) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.stateText}>{zh.common.loading}</Text>
      </View>
    );
  }

  if (search.isError && transactions.length === 0) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateTitle}>{zh.txList.searchFailed}</Text>
        <Pressable
          accessibilityRole="button"
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={() => void search.refetch()}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: '600' }}>{zh.common.retry}</Text>
        </Pressable>
      </View>
    );
  }

  if (transactions.length === 0) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateTitle}>{zh.txList.searchEmpty(displayQuery.trim())}</Text>
      </View>
    );
  }

  return (
    <FlashList
      key={query}
      data={listData}
      renderItem={renderItem}
      keyExtractor={(item) =>
        item.kind === 'header' ? `header-${item.dateKey}` : item.transaction.id
      }
      getItemType={(item) => item.kind}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 24 }}
      onEndReached={loadNextPage}
      onEndReachedThreshold={0.35}
      ListFooterComponent={
        search.isFetchingNextPage ? (
          <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
        ) : search.isFetchNextPageError ? (
          <Pressable
            accessibilityRole="button"
            style={styles.footerRetry}
            onPress={() => void search.fetchNextPage()}
          >
            <Text style={[styles.stateText, { color: colors.primary }]}>
              {zh.txList.loadMoreFailed}
            </Text>
          </Pressable>
        ) : null
      }
    />
  );
}

function makeStyles({ colors }: AppTheme) {
  return StyleSheet.create({
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      gap: 8,
    },
    stateTitle: { color: colors.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
    stateText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
    retryButton: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 9 },
    dayHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
    dayHeaderText: { color: colors.textSecondary, fontSize: 12 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      marginHorizontal: 12,
      marginBottom: 6,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 10,
    },
    transferIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    rowContent: { flex: 1, minWidth: 0 },
    rowTitle: { color: colors.text, fontSize: 15, fontWeight: '500' },
    rowSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    rowTrailing: { alignItems: 'flex-end' },
    rowTime: { color: colors.textSecondary, fontSize: 12 },
    rowAmount: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
    footerLoader: { paddingVertical: 16 },
    footerRetry: { alignItems: 'center', paddingVertical: 16 },
  });
}
