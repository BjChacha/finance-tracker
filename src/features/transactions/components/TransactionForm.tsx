import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { TransactionType } from '@/db/schema';
import { useAccountBalances } from '@/features/accounts';
import { useCategoryTree, type CategoryNode } from '@/features/categories';
import { zh } from '@/i18n/zh';
import { dayjs, todayKey } from '@/lib/date';
import { formatCents, parseMoneyToCents } from '@/lib/money';
import { useTheme, type AppTheme } from '@/theme';
import type { TxInput } from '../repository';

export type TxFormInitialValues = {
  type: TransactionType;
  amount: number;
  fee: number;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  dateKey: string;
  note: string;
};

type Props = {
  initialValues?: TxFormInitialValues;
  submitting?: boolean;
  onSubmit: (input: TxInput) => void;
};

const TYPE_TABS: { key: TransactionType; label: string }[] = [
  { key: 'expense', label: zh.tx.expense },
  { key: 'income', label: zh.tx.income },
  { key: 'transfer', label: zh.tx.transfer },
];

export function TransactionForm({ initialValues, submitting, onSubmit }: Props) {
  const theme = useTheme();
  const { colors } = theme;

  const [type, setType] = useState<TransactionType>(initialValues?.type ?? 'expense');
  const [amountText, setAmountText] = useState(
    initialValues ? formatCents(initialValues.amount, { grouping: false }) : '',
  );
  const [feeText, setFeeText] = useState(
    initialValues && initialValues.fee > 0
      ? formatCents(initialValues.fee, { grouping: false })
      : '',
  );
  const [accountId, setAccountId] = useState<string | null>(initialValues?.accountId ?? null);
  const [toAccountId, setToAccountId] = useState<string | null>(
    initialValues?.toAccountId ?? null,
  );
  const [categoryId, setCategoryId] = useState<string | null>(initialValues?.categoryId ?? null);
  const [dateText, setDateText] = useState(initialValues?.dateKey ?? todayKey());
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [expandedParent, setExpandedParent] = useState<string | null>(null);

  const { data: accounts = [] } = useAccountBalances();
  const categoryType = type === 'income' ? 'income' : 'expense';
  const { data: categoryTree = [] } = useCategoryTree(categoryType);

  const typeColor =
    type === 'expense' ? colors.expense : type === 'income' ? colors.income : colors.transfer;

  const effectiveAccountId = accountId ?? accounts[0]?.id ?? null;

  const styles = useMemo(() => makeStyles(theme), [theme]);

  function switchType(next: TransactionType) {
    if (next === type) return;
    setType(next);
    setCategoryId(null);
    setExpandedParent(null);
    if (next !== 'transfer') setToAccountId(null);
  }

  function handleSave() {
    const amount = parseMoneyToCents(amountText);
    if (amount === null || amount <= 0) {
      Alert.alert(zh.txList.invalidAmount);
      return;
    }
    if (!effectiveAccountId) {
      Alert.alert(zh.txList.needAccount);
      return;
    }
    const date = dayjs(dateText, 'YYYY-MM-DD');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || !date.isValid()) {
      Alert.alert(zh.txList.invalidDate);
      return;
    }
    let fee = 0;
    if (type === 'transfer') {
      if (!toAccountId || toAccountId === effectiveAccountId) {
        Alert.alert(zh.txList.sameAccount);
        return;
      }
      if (feeText.trim() !== '') {
        const parsedFee = parseMoneyToCents(feeText);
        if (parsedFee === null || parsedFee < 0) {
          Alert.alert(zh.txList.invalidFee);
          return;
        }
        fee = parsedFee;
      }
    } else if (!categoryId) {
      Alert.alert(zh.txList.needCategory);
      return;
    }
    onSubmit({
      type,
      amount,
      fee,
      accountId: effectiveAccountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: type === 'transfer' ? null : categoryId,
      date: date.hour(12).valueOf(),
      note: note.trim(),
    });
  }

  function shiftDate(days: number) {
    setDateText(dayjs(dateText).add(days, 'day').format('YYYY-MM-DD'));
  }

  function renderCategoryCell(node: CategoryNode) {
    const selected =
      categoryId === node.id || node.children.some((c) => c.id === categoryId);
    return (
      <Pressable
        key={node.id}
        style={[styles.categoryCell, selected && { backgroundColor: `${typeColor}22` }]}
        onPress={() => {
          setCategoryId(node.id);
          setExpandedParent(node.children.length > 0 ? node.id : null);
        }}
      >
        <Text style={styles.categoryIcon}>{node.icon}</Text>
        <Text
          style={[styles.categoryName, { color: selected ? typeColor : colors.text }]}
          numberOfLines={1}
        >
          {node.name}
        </Text>
      </Pressable>
    );
  }

  const expandedNode = categoryTree.find((n) => n.id === expandedParent);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* 类型切换 */}
      <View style={styles.segment}>
        {TYPE_TABS.map((tab) => {
          const active = tab.key === type;
          const tabColor =
            tab.key === 'expense'
              ? colors.expense
              : tab.key === 'income'
                ? colors.income
                : colors.transfer;
          return (
            <Pressable
              key={tab.key}
              style={[styles.segmentItem, active && { backgroundColor: tabColor }]}
              onPress={() => switchType(tab.key)}
            >
              <Text style={{ color: active ? '#FFFFFF' : colors.textSecondary, fontWeight: '600' }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 金额 */}
      <View style={styles.amountBox}>
        <Text style={[styles.currencySymbol, { color: typeColor }]}>¥</Text>
        <TextInput
          style={[styles.amountInput, { color: typeColor }]}
          value={amountText}
          onChangeText={setAmountText}
          placeholder={zh.txList.amountPlaceholder}
          placeholderTextColor={colors.border}
          keyboardType="decimal-pad"
          autoFocus={!initialValues}
        />
      </View>

      {/* 分类（支出/收入） */}
      {type !== 'transfer' && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{zh.tx.category}</Text>
          <View style={styles.categoryGrid}>{categoryTree.map(renderCategoryCell)}</View>
          {expandedNode && expandedNode.children.length > 0 && (
            <View style={styles.subRow}>
              {expandedNode.children.map((child) => {
                const selected = categoryId === child.id;
                return (
                  <Pressable
                    key={child.id}
                    style={[
                      styles.chip,
                      selected && { backgroundColor: typeColor, borderColor: typeColor },
                    ]}
                    onPress={() => setCategoryId(child.id)}
                  >
                    <Text style={{ color: selected ? '#FFFFFF' : colors.text, fontSize: 13 }}>
                      {child.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* 账户 */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>
          {type === 'transfer' ? zh.tx.fromAccount : zh.tx.account}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            {accounts.map((a) => {
              const selected = effectiveAccountId === a.id;
              return (
                <Pressable
                  key={a.id}
                  style={[
                    styles.chip,
                    selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setAccountId(a.id)}
                >
                  <Text style={{ color: selected ? '#FFFFFF' : colors.text, fontSize: 13 }}>
                    {a.icon} {a.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* 转账：转入账户 + 手续费 */}
      {type === 'transfer' && (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>{zh.tx.toAccount}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {accounts
                  .filter((a) => a.id !== effectiveAccountId)
                  .map((a) => {
                    const selected = toAccountId === a.id;
                    return (
                      <Pressable
                        key={a.id}
                        style={[
                          styles.chip,
                          selected && {
                            backgroundColor: colors.transfer,
                            borderColor: colors.transfer,
                          },
                        ]}
                        onPress={() => setToAccountId(a.id)}
                      >
                        <Text style={{ color: selected ? '#FFFFFF' : colors.text, fontSize: 13 }}>
                          {a.icon} {a.name}
                        </Text>
                      </Pressable>
                    );
                  })}
              </View>
            </ScrollView>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>{zh.tx.fee}</Text>
            <TextInput
              style={styles.textInput}
              value={feeText}
              onChangeText={setFeeText}
              placeholder={zh.txList.feePlaceholder}
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
            />
          </View>
        </>
      )}

      {/* 日期 */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>{zh.tx.date}</Text>
        <View style={styles.dateRow}>
          <Pressable style={styles.dateBtn} onPress={() => shiftDate(-1)}>
            <Text style={{ color: colors.text, fontSize: 13 }}>{zh.txList.prevDay}</Text>
          </Pressable>
          <TextInput
            style={[styles.textInput, styles.dateInput]}
            value={dateText}
            onChangeText={setDateText}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
          />
          <Pressable style={styles.dateBtn} onPress={() => setDateText(todayKey())}>
            <Text style={{ color: colors.primary, fontSize: 13 }}>{zh.txList.today}</Text>
          </Pressable>
          <Pressable style={styles.dateBtn} onPress={() => shiftDate(1)}>
            <Text style={{ color: colors.text, fontSize: 13 }}>{zh.txList.nextDay}</Text>
          </Pressable>
        </View>
      </View>

      {/* 备注 */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>{zh.tx.note}</Text>
        <TextInput
          style={styles.textInput}
          value={note}
          onChangeText={setNote}
          placeholder={zh.tx.notePlaceholder}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <Pressable
        style={[styles.saveBtn, { backgroundColor: typeColor, opacity: submitting ? 0.6 : 1 }]}
        onPress={handleSave}
        disabled={submitting}
      >
        <Text style={styles.saveBtnText}>{zh.common.save}</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles({ colors }: AppTheme) {
  return StyleSheet.create({
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 4,
      marginBottom: 12,
    },
    segmentItem: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 8,
    },
    amountBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    currencySymbol: { fontSize: 28, fontWeight: '600', marginRight: 8 },
    amountInput: { flex: 1, fontSize: 36, fontWeight: '700', paddingVertical: 14 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    sectionLabel: { color: colors.textSecondary, fontSize: 13, marginBottom: 8 },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    categoryCell: {
      width: '25%',
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 10,
    },
    categoryIcon: { fontSize: 24 },
    categoryName: { fontSize: 12, marginTop: 4 },
    subRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    chipRow: { flexDirection: 'row', gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 4,
    },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dateBtn: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dateInput: { flex: 1, textAlign: 'center' },
    textInput: {
      color: colors.text,
      fontSize: 15,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
    },
    saveBtn: {
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  });
}
