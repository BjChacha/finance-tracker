import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { SecondarySheetScreen } from '@/components/navigation/secondary-sheet-screen';
import {
  describeFrequency,
  usePendingRules,
  useRecurringRules,
  useConfirmPending,
  useSkipPending,
  useToggleRule,
  type RecurringListItem,
} from '@/features/recurring';
import { zh } from '@/i18n/zh';
import { formatCents } from '@/lib/money';
import { useTheme, type AppTheme } from '@/theme';

export default function RecurringScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const router = useRouter();

  const { data: rules = [] } = useRecurringRules();
  const { data: pending = [] } = usePendingRules();
  const confirm = useConfirmPending();
  const skip = useSkipPending();
  const toggle = useToggleRule();

  function typeColor(type: RecurringListItem['type']): string {
    return type === 'expense'
      ? colors.expense
      : type === 'income'
        ? colors.income
        : colors.transfer;
  }

  function amountLabel(rule: RecurringListItem): string {
    const sign = rule.type === 'expense' ? '-' : rule.type === 'income' ? '+' : '';
    return `${sign}${formatCents(rule.amount)}`;
  }

  function subLabel(rule: RecurringListItem): string {
    const freq = describeFrequency(rule.frequency, rule.interval, rule.anchor);
    const target =
      rule.type === 'transfer'
        ? `${rule.categoryName ?? ''} · ${rule.accountName ?? '?'} → ${rule.toAccountName ?? '?'}`
        : `${rule.categoryName ?? ''} · ${rule.accountName ?? ''}`;
    return `${freq} · ${target}`;
  }

  return (
    <SecondarySheetScreen title={zh.recurring.title}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96 }}>
        {/* 待确认 */}
        {pending.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{zh.recurring.pendingTitle}</Text>
            {pending.map((rule) => (
              <View key={rule.id} style={[styles.card, { backgroundColor: colors.card }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ruleName} numberOfLines={1}>
                    {rule.name}
                  </Text>
                  <Text style={styles.ruleSub} numberOfLines={1}>
                    {rule.nextRunDate} · {amountLabel(rule)}
                  </Text>
                </View>
                <Pressable
                  style={[styles.pendingBtn, { backgroundColor: colors.primary }]}
                  disabled={confirm.isPending}
                  onPress={() => confirm.mutate(rule.id)}
                >
                  <Text style={styles.pendingBtnText}>{zh.recurring.record}</Text>
                </Pressable>
                <Pressable
                  style={[styles.pendingBtn, styles.skipBtn, { borderColor: colors.border }]}
                  disabled={skip.isPending}
                  onPress={() => skip.mutate(rule.id)}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {zh.recurring.skip}
                  </Text>
                </Pressable>
              </View>
            ))}
            <View style={{ height: 12 }} />
          </>
        )}

        {/* 规则列表 */}
        {rules.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: colors.textSecondary }}>{zh.recurring.empty}</Text>
          </View>
        ) : (
          rules.map((rule) => (
            <Pressable
              key={rule.id}
              style={[styles.card, { backgroundColor: colors.card, opacity: rule.enabled ? 1 : 0.55 }]}
              onPress={() => router.push(`/recurring/edit?id=${rule.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.ruleName} numberOfLines={1}>
                  {rule.name}
                </Text>
                <Text style={styles.ruleSub} numberOfLines={1}>
                  {subLabel(rule)}
                </Text>
                <Text style={styles.ruleSub}>
                  {rule.enabled
                    ? `${zh.recurring.nextRun} ${rule.nextRunDate}${rule.autoCreate ? '' : ` · ${zh.recurring.pendingTitle}`}`
                    : zh.recurring.stopped}
                </Text>
              </View>
              <Text style={[styles.amount, { color: typeColor(rule.type) }]}>
                {amountLabel(rule)}
              </Text>
              <Switch
                value={rule.enabled === 1}
                onValueChange={(v) => toggle.mutate({ id: rule.id, enabled: v })}
                trackColor={{ true: colors.primary }}
              />
            </Pressable>
          ))
        )}
        </ScrollView>

        {/* 新增 */}
        <Pressable style={styles.fab} onPress={() => router.push('/recurring/edit')}>
          <Icon name="plus" size={26} color={colors.onPrimary} />
        </Pressable>
      </View>
    </SecondarySheetScreen>
  );
}

function makeStyles({ colors }: AppTheme) {
  return StyleSheet.create({
    sectionTitle: { color: colors.textSecondary, fontSize: 13, marginBottom: 8 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
    },
    ruleName: { color: colors.text, fontSize: 15, fontWeight: '500' },
    ruleSub: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
    amount: { fontSize: 15, fontWeight: '600' },
    pendingBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    pendingBtnText: { color: colors.onPrimary, fontSize: 13, fontWeight: '600' },
    skipBtn: { backgroundColor: 'transparent', borderWidth: 1 },
    empty: { alignItems: 'center', paddingVertical: 64 },
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
  });
}
