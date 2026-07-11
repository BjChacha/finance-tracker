import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TransactionType } from '@/db/schema';
import { useAccountBalances } from '@/features/accounts';
import { useCategoryTree, type CategoryNode } from '@/features/categories';
import { zh } from '@/i18n/zh';
import { appendCalcKey, evalMoneyExpr, hasPendingOp } from '@/lib/calc';
import { dayjs, todayKey } from '@/lib/date';
import { formatCents, parseMoneyToCents } from '@/lib/money';
import { useTheme, type AppTheme } from '@/theme';
import { CalcKeypad } from './CalcKeypad';
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
  const insets = useSafeAreaInsets();

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
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(() => new Date());
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [expandedParent, setExpandedParent] = useState<string | null>(null);
  const [keypadVisible, setKeypadVisible] = useState(!initialValues);

  // 小键盘弹出时，返回键（硬件返回 / header 返回 / modal 滑动）仅收起键盘；收起后恢复默认返回。
  usePreventRemove(keypadVisible, () => {
    setKeypadVisible(false);
  });

  const { data: accounts = [] } = useAccountBalances();
  const categoryType = type === 'income' ? 'income' : 'expense';
  const { data: categoryTree = [] } = useCategoryTree(categoryType);

  // 记一笔（新建）默认选一个分类：优先「其他支出/收入」兜底，否则首个；后续替换为智能检测。
  useEffect(() => {
    if (!initialValues && categoryId === null && categoryTree.length > 0) {
      const fallback = categoryTree.find((c) => c.name.startsWith('其他')) ?? categoryTree[0];
      setCategoryId(fallback.id);
    }
  }, [initialValues, categoryId, categoryTree]);

  const typeColor =
    type === 'expense' ? colors.expense : type === 'income' ? colors.income : colors.transfer;

  const effectiveAccountId = accountId ?? accounts[0]?.id ?? null;

  const evaluated = evalMoneyExpr(amountText);
  const preview = hasPendingOp(amountText) ? evaluated : null;
  const canSave =
    evaluated !== null &&
    evaluated > 0 &&
    !!effectiveAccountId &&
    (type === 'transfer'
      ? !!toAccountId && toAccountId !== effectiveAccountId
      : !!categoryId);

  const styles = useMemo(() => makeStyles(theme), [theme]);

  function switchType(next: TransactionType) {
    if (next === type) return;
    setType(next);
    setCategoryId(null);
    setExpandedParent(null);
    if (next !== 'transfer') setToAccountId(null);
  }

  function handleKey(key: string) {
    if (key === 'C') {
      setAmountText(''); // 清空 → 金额框回占位「0.00」（重置为 0）
      return;
    }
    setAmountText((prev) => appendCalcKey(prev, key));
  }

  // 完成：求值折叠为结果（非空时），再收起键盘。空 / 10÷0 等仅收起，不丢数据。
  function handleDone() {
    const r = evalMoneyExpr(amountText);
    if (r !== null) setAmountText(formatCents(r, { grouping: false }));
    setKeypadVisible(false);
  }

  function handleSave() {
    const amount = evalMoneyExpr(amountText);
    if (amount === null || amount <= 0 || !effectiveAccountId) return; // canSave 守卫，防御性
    const date = dayjs(dateText, 'YYYY-MM-DD');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || !date.isValid()) {
      Alert.alert(zh.txList.invalidDate);
      return;
    }
    let fee = 0;
    if (type === 'transfer' && feeText.trim() !== '') {
      const parsedFee = parseMoneyToCents(feeText);
      if (parsedFee === null || parsedFee < 0) {
        Alert.alert(zh.txList.invalidFee);
        return;
      }
      fee = parsedFee;
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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ flex: 1 }}>
    <ScrollView
      style={{ flex: 1 }}
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
      <Pressable
        style={styles.amountBox}
        onPress={() => {
          Keyboard.dismiss();
          setKeypadVisible(true);
        }}
      >
        <Text style={[styles.currencySymbol, { color: typeColor }]}>¥</Text>
        <Text style={[styles.amountInput, { color: amountText ? typeColor : colors.border }]}>
          {amountText || zh.txList.amountPlaceholder}
        </Text>
        {preview !== null && (
          <Text style={[styles.preview, { color: colors.textSecondary }]}>
            = {formatCents(preview, { grouping: false })}
          </Text>
        )}
      </Pressable>

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
              onFocus={() => setKeypadVisible(false)}
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
          <Pressable
            style={[styles.textInput, styles.dateInput, { alignItems: 'center' }]}
            onPress={() => {
              setTempDate(dayjs(dateText, 'YYYY-MM-DD').toDate());
              setDatePickerOpen(true);
            }}
          >
            <Text style={{ color: colors.text, fontSize: 15 }}>{dateText}</Text>
          </Pressable>
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
          onFocus={() => setKeypadVisible(false)}
        />
      </View>

      <Pressable
        style={[
          styles.saveBtn,
          { backgroundColor: typeColor, opacity: submitting || !canSave ? 0.6 : 1 },
        ]}
        onPress={handleSave}
        disabled={submitting || !canSave}
      >
        <Text style={styles.saveBtnText}>{zh.common.save}</Text>
      </Pressable>
    </ScrollView>
    {keypadVisible && (
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]}
        onStartShouldSetResponder={() => {
          setKeypadVisible(false);
          return true;
        }}
      />
    )}
    </View>
    {keypadVisible && <CalcKeypad onKey={handleKey} onDone={handleDone} />}

    {/* 日期选择器：Android 系统对话框 / iOS 底部滚轮面板（display=spinner） */}
    {datePickerOpen && Platform.OS === 'android' && (
      <DateTimePicker
        value={tempDate}
        mode="date"
        display="spinner"
        onChange={(e, selected) => {
          setDatePickerOpen(false);
          if (e.type === 'set' && selected) setDateText(dayjs(selected).format('YYYY-MM-DD'));
        }}
      />
    )}
    {datePickerOpen && Platform.OS === 'ios' && (
      <Modal transparent animationType="slide" onRequestClose={() => setDatePickerOpen(false)}>
        <Pressable style={styles.pickerMask} onPress={() => setDatePickerOpen(false)}>
          <Pressable
            style={[styles.pickerSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 8 }]}
            onPress={() => {}}
          >
            <View style={styles.pickerHeader}>
              <Pressable
                onPress={() => {
                  setDateText(dayjs(tempDate).format('YYYY-MM-DD'));
                  setDatePickerOpen(false);
                }}
              >
                <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>
                  {zh.common.done}
                </Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={tempDate}
              mode="date"
              display="spinner"
              onChange={(e, selected) => {
                if (selected) setTempDate(selected);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    )}
    </View>
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
    preview: { fontSize: 16, fontWeight: '500', flexShrink: 1 },
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
    pickerMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    pickerSheet: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
    pickerHeader: { flexDirection: 'row', justifyContent: 'flex-end', padding: 12 },
  });
}
