import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  TransactionForm,
  useRemoveTransaction,
  useTransaction,
  useUpdateTransaction,
} from '@/features/transactions';
import { zh } from '@/i18n/zh';
import { dayjs } from '@/lib/date';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);

  const { data: tx, isLoading } = useTransaction(id ?? '');
  const update = useUpdateTransaction();
  const remove = useRemoveTransaction();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>{zh.common.loading}</Text>
      </View>
    );
  }
  if (!tx) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>{zh.common.empty}</Text>
      </View>
    );
  }

  const typeLabel = zh.tx[tx.type];
  const amountColor =
    tx.type === 'expense' ? colors.expense : tx.type === 'income' ? colors.income : colors.transfer;

  function confirmDelete() {
    Alert.alert(zh.common.delete, zh.tx.deleteConfirm, [
      { text: zh.common.cancel, style: 'cancel' },
      {
        text: zh.common.delete,
        style: 'destructive',
        onPress: () => remove.mutate(id!, { onSuccess: () => router.back() }),
      },
    ]);
  }

  if (editing) {
    return (
      <>
        <Stack.Screen options={{ title: zh.common.edit }} />
        <TransactionForm
          initialValues={{
            type: tx.type,
            amount: tx.amount,
            fee: tx.fee,
            accountId: tx.accountId,
            toAccountId: tx.toAccountId,
            categoryId: tx.categoryId,
            dateKey: tx.dateKey,
            note: tx.note,
          }}
          submitting={update.isPending}
          onSubmit={(input) => {
            update.mutate(
              { id: tx.id, input },
              {
                onSuccess: () => setEditing(false),
                onError: (e) =>
                  Alert.alert(zh.common.error, e instanceof Error ? e.message : String(e)),
              },
            );
          }}
        />
      </>
    );
  }

  const rows: [string, string][] = [
    [zh.tx.amount, formatCentsWithSymbol(tx.amount)],
    ...(tx.type === 'transfer'
      ? ([
          [zh.tx.fromAccount, `${tx.accountName ?? ''}`],
          [zh.tx.toAccount, `${tx.toAccountName ?? ''}`],
          [zh.tx.fee, formatCentsWithSymbol(tx.fee)],
        ] as [string, string][])
      : ([
          [zh.tx.category, `${tx.categoryIcon ?? ''} ${tx.categoryName ?? ''}`.trim()],
          [zh.tx.account, `${tx.accountName ?? ''}`],
        ] as [string, string][])),
    [zh.tx.date, dayjs(tx.date).format('YYYY年MM月DD日')],
    [zh.tx.note, tx.note || '—'],
  ];

  return (
    <>
      <Stack.Screen options={{ title: zh.txList.detailTitle }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16 }}
      >
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.typeBadge, { color: amountColor }]}>{typeLabel}</Text>
          <Text style={[styles.amount, { color: amountColor }]}>
            {tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''}
            {formatCentsWithSymbol(tx.amount)}
          </Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {rows.map(([label, value]) => (
            <View key={label} style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{label}</Text>
              <Text style={{ color: colors.text, fontSize: 14, flexShrink: 1 }}>{value}</Text>
            </View>
          ))}
        </View>
        <View style={styles.btnRow}>
          <Pressable
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={() => setEditing(true)}
          >
            <Text style={styles.btnText}>{zh.common.edit}</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, { backgroundColor: colors.expense }]}
            onPress={confirmDelete}
          >
            <Text style={styles.btnText}>{zh.common.delete}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 12, padding: 16, marginBottom: 12 },
  typeBadge: { fontSize: 13, fontWeight: '600' },
  amount: { fontSize: 32, fontWeight: '700', marginTop: 6 },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  btnRow: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
