import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { IconBubble } from '@/components/IconBubble';
import { useFloatingTabBarInset } from '@/components/navigation/floating-tab-bar';
import { useResidentEditor } from '@/components/navigation/resident-editor-sheet-host';
import {
  ACCOUNT_TYPES,
  normalizeAccountType,
  totalAssets,
  useAccountBalances,
  type AccountWithBalance,
} from '@/features/accounts';
import { TrendLineChart, useNetWorthTrend } from '@/features/stats';
import type { AccountType } from '@/db/schema';
import { zh } from '@/i18n/zh';
import { resolveIconKey } from '@/lib/iconResolvers';
import { dayjs } from '@/lib/date';
import { formatCents, formatCentsWithSymbol, toBaseCents } from '@/lib/money';
import { useTheme, type AppTheme } from '@/theme';

/** 资产概览（净资产 + 迷你趋势）+ 按账户类型分组的账户列表。 */
export default function AssetsScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const { openAccount } = useResidentEditor();
  const tabBarInset = useFloatingTabBarInset();

  const { data: accounts = [] } = useAccountBalances();
  const { data: netWorth = [] } = useNetWorthTrend();

  const styles = useMemo(() => makeStyles(theme), [theme]);

  /** 净资产拆分：资产总额（余额≥0）/ 负债总额（余额<0，取绝对值），均折算到本位币 */
  const totals = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    for (const a of accounts) {
      if (a.includeInTotal !== 1 || a.archived !== 0) continue;
      const base = toBaseCents(a.balance, a.rateToBase);
      if (base >= 0) assets += base;
      else liabilities += -base;
    }
    return { assets, liabilities };
  }, [accounts]);

  const netWorthPoints = netWorth.map((p) => ({
    label: dayjs(`${p.month}-01`).format('M月'),
    primary: p.value,
  }));

  const groups = useMemo(() => {
    const map = new Map<AccountType, AccountWithBalance[]>();
    for (const a of accounts) {
      const type = normalizeAccountType(a.type);
      const arr = map.get(type) ?? [];
      arr.push(a);
      map.set(type, arr);
    }
    return ACCOUNT_TYPES.filter((t) => map.has(t)).map((t) => ({ type: t, items: map.get(t)! }));
  }, [accounts]);

  function groupSubtotal(items: AccountWithBalance[]): number {
    return items
      .filter((a) => a.includeInTotal === 1 && a.archived === 0)
      .reduce((sum, a) => sum + toBaseCents(a.balance, a.rateToBase), 0);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarInset }]}
    >
      {/* 资产概览：净资产 + 资产/负债（语义色，负债以负数呈现）+ 平滑迷你趋势 */}
      <View style={[styles.overviewCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>{zh.assets.netWorth}</Text>
        <Text style={[styles.totalValue, { color: colors.primary }]}>
          {formatCentsWithSymbol(totalAssets(accounts))}
        </Text>
        <View style={styles.totalSubRow}>
          <View style={styles.totalSubCol}>
            <Text style={[styles.totalSubLabel, { color: colors.textSecondary }]}>
              {zh.assets.totalAssetsLabel}
            </Text>
            <Text style={[styles.totalSubValue, { color: colors.income }]}>
              {formatCentsWithSymbol(totals.assets)}
            </Text>
          </View>
          <View style={styles.totalSubCol}>
            <Text style={[styles.totalSubLabel, { color: colors.textSecondary }]}>
              {zh.assets.totalLiabilitiesLabel}
            </Text>
            <Text style={[styles.totalSubValue, { color: colors.expense }]}>
              {formatCentsWithSymbol(-totals.liabilities)}
            </Text>
          </View>
        </View>
        {netWorthPoints.length > 0 && (
          <View style={styles.sparkWrap}>
            <TrendLineChart
              points={netWorthPoints}
              primaryColor={colors.primary}
              primaryLabel={zh.stats.netWorth}
              compact
              curved
              height={80}
            />
          </View>
        )}
      </View>

      {/* 账户列表：按账户类型分组，单卡展示 */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={styles.cardTitle}>{zh.assets.accountList}</Text>
        {groups.map((g, gi) => (
          <View key={g.type} style={gi > 0 ? styles.groupSection : undefined}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupType}>{zh.accounts.types[g.type]}</Text>
              <Text style={[styles.subtotal, { color: colors.textSecondary }]}>
                {zh.assets.groupSubtotal} {formatCents(groupSubtotal(g.items))}
              </Text>
            </View>
            {g.items.map((a, i) => (
              <Pressable
                key={a.id}
                style={[styles.accRow, i < g.items.length - 1 && styles.accRowBorder]}
                onPress={() => openAccount(a.id)}
              >
                <IconBubble name={resolveIconKey(a.icon, 'account')} color={a.color} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.accName}>{a.name}</Text>
                  {a.includeInTotal === 0 && (
                    <Text style={[styles.accHint, { color: colors.textSecondary }]}>
                      {`不${zh.accounts.includeInTotal}`}
                    </Text>
                  )}
                </View>
                <Text style={[styles.accBalance, { color: colors.text }]}>
                  {formatCentsWithSymbol(a.balance, a.currency)}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function makeStyles({ colors }: AppTheme) {
  return StyleSheet.create({
    content: { padding: 16, gap: 12 },
    overviewCard: { borderRadius: 14, padding: 16 },
    totalLabel: { fontSize: 13 },
    totalValue: { fontSize: 30, fontWeight: '700', marginTop: 6, fontVariant: ['tabular-nums'] },
    totalSubRow: { flexDirection: 'row', marginTop: 16, gap: 24 },
    totalSubCol: { flex: 1 },
    totalSubLabel: { fontSize: 12 },
    totalSubValue: { fontSize: 15, fontWeight: '600', marginTop: 2, fontVariant: ['tabular-nums'] },
    sparkWrap: { marginTop: 12 },
    card: { borderRadius: 12, padding: 16 },
    cardTitle: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 12 },
    groupSection: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    groupType: { color: colors.text, fontSize: 13, fontWeight: '600' },
    subtotal: { fontSize: 12, fontVariant: ['tabular-nums'] },
    accRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
    accRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    accName: { color: colors.text, fontSize: 15, fontWeight: '500' },
    accHint: { fontSize: 12, marginTop: 2 },
    accBalance: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  });
}
