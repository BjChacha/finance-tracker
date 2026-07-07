import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  useMonthSummary,
  useTransactions,
  type TxListItem,
} from '@/features/transactions';
import { zh } from '@/i18n/zh';
import { dayjs, formatDayHeader, toMonthKey, todayKey } from '@/lib/date';
import { formatCents } from '@/lib/money';
import { useTheme, type AppTheme } from '@/theme';

type DayHeaderItem = { kind: 'header'; dateKey: string; income: number; expense: number };
type TxRowItem = { kind: 'row'; tx: TxListItem };
type ListItem = DayHeaderItem | TxRowItem;

export default function TransactionsScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const router = useRouter();
  const [monthKey, setMonthKey] = useState(() => toMonthKey(todayKey()));

  const { data: txs = [] } = useTransactions({ monthKey });
  const { data: summary } = useMonthSummary(monthKey);

  const styles = useMemo(() => makeStyles(theme), [theme]);

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    let currentKey = '';
    let headerIndex = -1;
    for (const tx of txs) {
      if (tx.dateKey !== currentKey) {
        currentKey = tx.dateKey;
        headerIndex = items.length;
        items.push({ kind: 'header', dateKey: tx.dateKey, income: 0, expense: 0 });
      }
      const header = items[headerIndex] as DayHeaderItem;
      if (tx.type === 'income') header.income += tx.amount;
      else if (tx.type === 'expense') header.expense += tx.amount;
      else header.expense += tx.fee;
      items.push({ kind: 'row', tx });
    }
    return items;
  }, [txs]);

  const income = summary?.income ?? 0;
  const expense = summary?.expense ?? 0;

  function shiftMonth(delta: number) {
    setMonthKey(dayjs(`${monthKey}-01`).add(delta, 'month').format('YYYY-MM'));
  }

  function renderItem({ item }: { item: ListItem }) {
    if (item.kind === 'header') {
      return (
        <View style={styles.dayHeader}>
          <Text style={styles.dayHeaderText}>{formatDayHeader(item.dateKey)}</Text>
          <Text style={styles.dayHeaderText}>
            {item.expense > 0 ? `${zh.tx.expense} ${formatCents(item.expense)}` : ''}
            {item.expense > 0 && item.income > 0 ? '  ' : ''}
            {item.income > 0 ? `${zh.tx.income} ${formatCents(item.income)}` : ''}
          </Text>
        </View>
      );
    }
    const { tx } = item;
    const isTransfer = tx.type === 'transfer';
    const amountColor =
      tx.type === 'expense' ? colors.expense : tx.type === 'income' ? colors.income : colors.transfer;
    const title = isTransfer
      ? `${tx.accountName ?? '?'} → ${tx.toAccountName ?? '?'}`
      : (tx.categoryName ?? zh.common.empty);
    const sub = isTransfer
      ? tx.note || zh.tx.transfer
      : `${tx.accountName ?? ''}${tx.note ? ` · ${tx.note}` : ''}`;
    const sign = tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : '';
    return (
      <Pressable style={styles.row} onPress={() => router.push(`/transaction/${tx.id}`)}>
        <Text style={styles.rowIcon}>{isTransfer ? '🔁' : (tx.categoryIcon ?? '📦')}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.rowAmount, { color: amountColor }]}>
            {sign}
            {formatCents(tx.amount)}
          </Text>
          {isTransfer && tx.fee > 0 && (
            <Text style={styles.rowSub}>
              {zh.tx.fee} {formatCents(tx.fee)}
            </Text>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* 月份切换 */}
      <View style={styles.monthBar}>
        <Pressable style={styles.monthArrow} onPress={() => shiftMonth(-1)}>
          <Text style={styles.monthArrowText}>←</Text>
        </Pressable>
        <Text style={styles.monthTitle}>{dayjs(`${monthKey}-01`).format('YYYY年MM月')}</Text>
        <Pressable style={styles.monthArrow} onPress={() => shiftMonth(1)}>
          <Text style={styles.monthArrowText}>→</Text>
        </Pressable>
      </View>

      {/* 汇总条 */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{zh.txList.monthIncome}</Text>
          <Text style={[styles.summaryValue, { color: colors.income }]}>
            {formatCents(income)}
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{zh.txList.monthExpense}</Text>
          <Text style={[styles.summaryValue, { color: colors.expense }]}>
            {formatCents(expense)}
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{zh.txList.monthBalance}</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {formatCents(income - expense)}
          </Text>
        </View>
      </View>

      {listData.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.textSecondary }}>{zh.txList.emptyMonth}</Text>
        </View>
      ) : (
        <FlashList
          data={listData}
          renderItem={renderItem}
          keyExtractor={(item) => (item.kind === 'header' ? `h-${item.dateKey}` : item.tx.id)}
          getItemType={(item) => item.kind}
          contentContainerStyle={{ paddingBottom: 96 }}
        />
      )}

      {/* 悬浮记一笔 */}
      <Pressable style={styles.fab} onPress={() => router.push('/add-transaction')}>
        <Text style={styles.fabText}>＋</Text>
      </Pressable>
    </View>
  );
}

function makeStyles({ colors }: AppTheme) {
  return StyleSheet.create({
    monthBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      paddingVertical: 10,
    },
    monthArrow: { paddingHorizontal: 24, paddingVertical: 4 },
    monthArrowText: { color: colors.primary, fontSize: 18 },
    monthTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
    summaryBar: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      paddingVertical: 12,
    },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryLabel: { color: colors.textSecondary, fontSize: 12 },
    summaryValue: { fontSize: 16, fontWeight: '600', marginTop: 2 },
    dayHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 6,
    },
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
    rowIcon: { fontSize: 22 },
    rowTitle: { color: colors.text, fontSize: 15, fontWeight: '500' },
    rowSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    rowAmount: { fontSize: 16, fontWeight: '600' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
    },
    fabText: { color: '#FFFFFF', fontSize: 28, lineHeight: 32 },
  });
}
