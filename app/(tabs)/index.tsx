import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { useFloatingTabBarInset } from '@/components/navigation/floating-tab-bar';
import { useBudgetStatus } from '@/features/budgets';
import {
  TransactionRow,
  useDaySummary,
  useRecentTransactions,
  type TxListItem,
} from '@/features/transactions';
import { zh } from '@/i18n/zh';
import { toMonthKey, todayKey, yesterdayKey } from '@/lib/date';
import { formatCents } from '@/lib/money';
import { isQuickKeypadAvailable, openKeypad } from '@/lib/quickKeypad';
import { useTheme, type AppTheme } from '@/theme';

/** 总览首页：今日收支 + 本月预算快照 + 最近交易（查看全部→全量流水）。 */
export default function OverviewScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const router = useRouter();
  const tabBarInset = useFloatingTabBarInset();

  const todayK = todayKey();
  const yesterdayK = yesterdayKey();
  const monthKey = toMonthKey(todayK);

  const { data: day } = useDaySummary(todayK);
  const { data: budget } = useBudgetStatus(monthKey);
  const { data: recent = [] } = useRecentTransactions(3);

  const styles = useMemo(() => makeStyles(theme), [theme]);

  // 最近交易按 今日 / 昨日 / 近期 分组（近期=更早；条目数上限由 useRecentTransactions 控制）
  const recentSections = useMemo(() => {
    const groups: { title: string; items: TxListItem[] }[] = [
      { title: zh.overview.groupToday, items: [] },
      { title: zh.overview.groupYesterday, items: [] },
      { title: zh.overview.groupRecent, items: [] },
    ];
    for (const tx of recent) {
      if (tx.dateKey === todayK) groups[0].items.push(tx);
      else if (tx.dateKey === yesterdayK) groups[1].items.push(tx);
      else groups[2].items.push(tx);
    }
    return groups.filter((g) => g.items.length > 0);
  }, [recent, todayK, yesterdayK]);

  const income = day?.income ?? 0;
  const expense = day?.expense ?? 0;
  const net = income - expense;
  const netColor = net > 0 ? colors.income : net < 0 ? colors.expense : colors.text;

  const total = budget?.total ?? null;
  const levelColor = !total
    ? colors.primary
    : total.level === 'over'
      ? colors.expense
      : total.level === 'warn'
        ? colors.warning
        : colors.primary;

  async function openAddTransaction() {
    if (Platform.OS !== 'android' || !isQuickKeypadAvailable()) {
      router.push('/add-transaction');
      return;
    }

    try {
      const result = await openKeypad();
      if (!result) return;
      router.push({
        pathname: '/add-transaction',
        params: {
          amount: String(Math.abs(result.amountCents)),
          currency: result.currency,
          type: result.amountCents < 0 ? 'income' : 'expense',
        },
      });
    } catch {
      router.push('/add-transaction');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarInset }]}>
        {/* 今日收支 */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.dayRow}>
            <View style={styles.dayCol}>
              <Text style={styles.dayLabel}>{zh.overview.todayIncome}</Text>
              <Text style={[styles.dayValue, { color: colors.income }]}>{formatCents(income)}</Text>
            </View>
            <View style={[styles.dayDivider, { backgroundColor: colors.border }]} />
            <View style={styles.dayCol}>
              <Text style={styles.dayLabel}>{zh.overview.todayExpense}</Text>
              <Text style={[styles.dayValue, { color: colors.expense }]}>{formatCents(expense)}</Text>
            </View>
            <View style={[styles.dayDivider, { backgroundColor: colors.border }]} />
            <View style={styles.dayCol}>
              <Text style={styles.dayLabel}>{zh.overview.todayNet}</Text>
              <Text style={[styles.dayValue, { color: netColor }]}>
                {net > 0 ? '+' : ''}
                {formatCents(net)}
              </Text>
            </View>
          </View>
        </View>

        {/* 最近交易 */}
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.cardTitle}>{zh.overview.recentTitle}</Text>
            <Pressable onPress={() => router.push('/transactions')} hitSlop={8}>
              <Text style={[styles.viewAll, { color: colors.primary }]}>{zh.overview.viewAll}</Text>
            </Pressable>
          </View>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {recent.length === 0 ? (
              <View style={styles.empty}>
                <Text style={{ color: colors.textSecondary }}>{zh.common.empty}</Text>
              </View>
            ) : (
              recentSections.map((section, si) => (
                <View key={section.title} style={si > 0 ? styles.groupDivider : undefined}>
                  <Text style={styles.groupHeader}>{section.title}</Text>
                {section.items.map((tx, i) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    showDivider={i !== section.items.length - 1}
                  />
                ))}
                </View>
              ))
            )}
          </View>
        </View>

        {/* 本月预算快照 */}
        <Pressable
          style={[styles.card, { backgroundColor: colors.card }]}
          onPress={() => router.push('/budgets')}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{zh.overview.budgetSnapshot}</Text>
            {total && (
              <Text style={[styles.pct, { color: levelColor }]}>
                {total.pct >= 100 ? zh.budgets.overspent : `${total.pct}%`}
              </Text>
            )}
          </View>
          {total ? (
            <>
              <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.min(total.pct, 100)}%`, backgroundColor: levelColor },
                  ]}
                />
              </View>
              <View style={styles.budgetMeta}>
                <Text style={styles.metaText}>
                  {zh.budgets.spent} {formatCents(total.spent)} / {formatCents(total.amount)}
                </Text>
                {total.daily > 0 && (
                  <Text style={styles.metaText}>
                    {zh.budgets.dailyAvailable} {formatCents(total.daily)}
                  </Text>
                )}
              </View>
            </>
          ) : (
            <View style={[styles.noBudget, { borderColor: colors.border }]}>
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {zh.overview.noBudgetHint}
              </Text>
              <Text style={[styles.setBudget, { color: colors.primary }]}>{zh.overview.setBudget}</Text>
            </View>
          )}
        </Pressable>
      </ScrollView>

      {/* 悬浮记一笔 */}
      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary, bottom: tabBarInset + 8 }]}
        onPress={() => void openAddTransaction()}
      >
        <Icon name="plus" size={26} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

function makeStyles({ colors }: AppTheme) {
  return StyleSheet.create({
    content: { padding: 16, gap: 12 },
    card: { borderRadius: 12, padding: 16 },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    cardTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
    pct: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
    dayRow: { flexDirection: 'row', alignItems: 'center' },
    dayCol: { flex: 1, alignItems: 'center' },
    dayDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
    dayLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: 4 },
    dayValue: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
    barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
    barFill: { height: 8, borderRadius: 4 },
    budgetMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    metaText: { color: colors.textSecondary, fontSize: 12 },
    noBudget: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: 8,
      paddingVertical: 14,
      alignItems: 'center',
      gap: 4,
    },
    setBudget: { fontSize: 13, fontWeight: '600' },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 2,
      marginBottom: 8,
    },
    viewAll: { fontSize: 13, fontWeight: '500' },
    groupHeader: { color: colors.textSecondary, fontSize: 12, fontWeight: '500', marginBottom: 2 },
    groupDivider: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    empty: { paddingVertical: 20, alignItems: 'center' },
    fab: {
      position: 'absolute',
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
    },
  });
}
