import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import {
  SecondarySheetScreen,
  SheetHeaderIconButton,
} from '@/components/navigation/secondary-sheet-screen';
import {
  TransactionRow,
  useAllTimeSummary,
  useTransactions,
  type TxListItem,
} from '@/features/transactions';
import { zh } from '@/i18n/zh';
import { formatDayHeader } from '@/lib/date';
import { formatCents } from '@/lib/money';
import { useTheme, type AppTheme } from '@/theme';

type HeaderTotals = { income: number; expense: number };
type YearHeaderItem = { kind: 'year'; year: string; collapsed: boolean } & HeaderTotals;
type MonthHeaderItem = { kind: 'month'; monthKey: string; collapsed: boolean } & HeaderTotals;
type DayHeaderItem = { kind: 'day'; dateKey: string } & HeaderTotals;
type TxRowItem = { kind: 'row'; tx: TxListItem; showDivider: boolean };
type ListItem = YearHeaderItem | MonthHeaderItem | DayHeaderItem | TxRowItem;

/** header 小计文本：支出 / 收入（均为本位币分，与 allTimeSummary 口径一致） */
function formatHeaderTotals(totals: HeaderTotals): string {
  const parts: string[] = [];
  if (totals.expense > 0) parts.push(`${zh.tx.expense} ${formatCents(totals.expense)}`);
  if (totals.income > 0) parts.push(`${zh.tx.income} ${formatCents(totals.income)}`);
  return parts.join('  ');
}

/** 全部交易流水（默认列出全部时间，按年/月/日三级分组，点击年/月可折叠）。由「总览」页的「查看全部」进入。 */
export default function TransactionsScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const router = useRouter();

  const [collapsedYears, setCollapsedYears] = useState<ReadonlySet<string>>(new Set());
  const [collapsedMonths, setCollapsedMonths] = useState<ReadonlySet<string>>(new Set());

  const { data: txs = [] } = useTransactions({});
  const { data: summary } = useAllTimeSummary();

  const styles = useMemo(() => makeStyles(theme), [theme]);

  const toggleYear = (year: string) => {
    setCollapsedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };
  const toggleMonth = (monthKey: string) => {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  };

  // txs 已按 date desc 排序；按 年→月→日 三级分组。折叠的年/月只保留其 header，
  // 但小计仍完整累加到所属年/月 header（折叠时显示完整小计）。
  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    let curYear = '';
    let curMonth = '';
    let curDay = '';
    let yearIdx = -1;
    let monthIdx = -1;
    let dayIdx = -1;

    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      const year = tx.dateKey.slice(0, 4);
      const month = tx.dateKey.slice(0, 7);
      const day = tx.dateKey;

      if (year !== curYear) {
        curYear = year;
        curMonth = '';
        curDay = '';
        yearIdx = items.length;
        items.push({
          kind: 'year',
          year,
          income: 0,
          expense: 0,
          collapsed: collapsedYears.has(year),
        });
        monthIdx = -1;
        dayIdx = -1;
      }
      const yearVisible = !collapsedYears.has(year);
      if (yearVisible && month !== curMonth) {
        curMonth = month;
        curDay = '';
        monthIdx = items.length;
        items.push({
          kind: 'month',
          monthKey: month,
          income: 0,
          expense: 0,
          collapsed: collapsedMonths.has(month),
        });
        dayIdx = -1;
      }
      const monthVisible = yearVisible && !collapsedMonths.has(month);
      if (monthVisible && day !== curDay) {
        curDay = day;
        dayIdx = items.length;
        items.push({ kind: 'day', dateKey: day, income: 0, expense: 0 });
      }

      // 口径与 allTimeSummary 一致：收支按本位币分，转账手续费折本位币计支出
      const isIncome = tx.type === 'income';
      const isExpense = tx.type === 'expense';
      const amount =
        isIncome || isExpense
          ? tx.amountBaseCents
          : Math.round((tx.fee * tx.exchangeRate) / 1_000_000);
      const yearHeader = items[yearIdx] as HeaderTotals;
      if (isIncome) yearHeader.income += amount;
      else yearHeader.expense += amount;
      // 折叠时仍累加所属月/日 header 小计（header 存在即累加，与是否渲染无关）
      if (monthIdx >= 0) {
        const monthHeader = items[monthIdx] as HeaderTotals;
        if (isIncome) monthHeader.income += amount;
        else monthHeader.expense += amount;
      }
      if (dayIdx >= 0) {
        const dayHeader = items[dayIdx] as HeaderTotals;
        if (isIncome) dayHeader.income += amount;
        else dayHeader.expense += amount;
      }

      if (!monthVisible) continue; // 年/月折叠：不渲染交易行
      // 同日内下一笔才显示分隔线；日末行紧接新的日/月/年标题，不画线
      const nextTx = txs[i + 1];
      const showDivider = !!nextTx && nextTx.dateKey === tx.dateKey;
      items.push({ kind: 'row', tx, showDivider });
    }
    return items;
  }, [txs, collapsedYears, collapsedMonths]);

  const income = summary?.income ?? 0;
  const expense = summary?.expense ?? 0;

  function renderItem({ item }: { item: ListItem }) {
    if (item.kind === 'year') {
      return (
        <Pressable style={styles.yearHeader} onPress={() => toggleYear(item.year)}>
          <View style={styles.groupTitleRow}>
            <Icon
              name={item.collapsed ? 'chevron-right' : 'chevron-down'}
              size={14}
              color={colors.textSecondary}
            />
            <Text style={styles.yearHeaderText}>
              {item.year}
              {zh.txList.yearSuffix}
            </Text>
          </View>
          <Text style={styles.yearHeaderSum}>{formatHeaderTotals(item)}</Text>
        </Pressable>
      );
    }
    if (item.kind === 'month') {
      const monthNum = Number(item.monthKey.slice(5, 7));
      return (
        <Pressable style={styles.monthHeader} onPress={() => toggleMonth(item.monthKey)}>
          <View style={styles.groupTitleRow}>
            <Icon
              name={item.collapsed ? 'chevron-right' : 'chevron-down'}
              size={13}
              color={colors.textSecondary}
            />
            <Text style={styles.monthHeaderText}>
              {monthNum}
              {zh.txList.monthSuffix}
            </Text>
          </View>
          <Text style={styles.monthHeaderSum}>{formatHeaderTotals(item)}</Text>
        </Pressable>
      );
    }
    if (item.kind === 'day') {
      return (
        <View style={styles.dayHeader}>
          <Text style={styles.dayHeaderText}>{formatDayHeader(item.dateKey)}</Text>
          <Text style={styles.dayHeaderSum}>{formatHeaderTotals(item)}</Text>
        </View>
      );
    }
    // 行背景用 card 色，与「最近交易」一致
    return <TransactionRow tx={item.tx} showDivider={item.showDivider} style={styles.txRow} />;
  }

  return (
    <SecondarySheetScreen
      title={zh.txList.allTransactions}
      headerRight={
        <SheetHeaderIconButton
          icon="search"
          label={zh.txList.searchAction}
          onPress={() => router.push('/transactions/search')}
        />
      }
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* 全部时间汇总 */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{zh.txList.totalIncome}</Text>
            <Text style={[styles.summaryValue, { color: colors.income }]}>
              {formatCents(income)}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{zh.txList.totalExpense}</Text>
            <Text style={[styles.summaryValue, { color: colors.expense }]}>
              {formatCents(expense)}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{zh.txList.totalBalance}</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {formatCents(income - expense)}
            </Text>
          </View>
        </View>

        {listData.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: colors.textSecondary }}>{zh.txList.emptyAll}</Text>
          </View>
        ) : (
          <FlashList
            data={listData}
            renderItem={renderItem}
            keyExtractor={(item) =>
              item.kind === 'year'
                ? `y-${item.year}`
                : item.kind === 'month'
                  ? `m-${item.monthKey}`
                  : item.kind === 'day'
                    ? `d-${item.dateKey}`
                    : item.tx.id
            }
            getItemType={(item) => item.kind}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>
    </SecondarySheetScreen>
  );
}

function makeStyles({ colors }: AppTheme) {
  return StyleSheet.create({
    summaryBar: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      paddingVertical: 12,
    },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryLabel: { color: colors.textSecondary, fontSize: 12 },
    summaryValue: { fontSize: 16, fontWeight: '600', marginTop: 2 },
    yearHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 6,
    },
    yearHeaderText: { color: colors.text, fontSize: 15, fontWeight: '700' },
    yearHeaderSum: { color: colors.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 4,
    },
    monthHeaderText: { color: colors.text, fontSize: 13, fontWeight: '600' },
    monthHeaderSum: { color: colors.textSecondary, fontSize: 11, fontVariant: ['tabular-nums'] },
    groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    dayHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 6,
    },
    dayHeaderText: { color: colors.textSecondary, fontSize: 12 },
    dayHeaderSum: { color: colors.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] },
    txRow: { paddingHorizontal: 16, backgroundColor: colors.card },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
}
