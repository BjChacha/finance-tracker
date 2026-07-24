import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { RecurringFrequency, TransactionType } from '@/db/schema';
import { useAccountBalances } from '@/features/accounts';
import { useCategoryTree } from '@/features/categories';
import {
  useCreateRule,
  useRecurringRules,
  useRemoveRule,
  useUpdateRule,
  type RecurringInput,
} from '@/features/recurring';
import { promptSwitchOnNegative } from '@/features/transactions';
import { zh } from '@/i18n/zh';
import { todayKey } from '@/lib/date';
import { formatCents, parseMoneyToCents } from '@/lib/money';
import { useTheme, type AppTheme } from '@/theme';

const TYPE_TABS: { key: TransactionType; label: string }[] = [
  { key: 'expense', label: zh.tx.expense },
  { key: 'income', label: zh.tx.income },
  { key: 'transfer', label: zh.tx.transfer },
];

const FREQ_TABS: { key: RecurringFrequency; label: string }[] = [
  { key: 'daily', label: '每天' },
  { key: 'weekly', label: '每周' },
  { key: 'monthly', label: '每月' },
  { key: 'yearly', label: '每年' },
];

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function RecurringEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const { data: rules = [] } = useRecurringRules();
  const existing = id ? rules.find((r) => r.id === id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<TransactionType>(existing?.type ?? 'expense');
  const [amountText, setAmountText] = useState(
    existing ? formatCents(existing.amount, { grouping: false }) : '',
  );
  const [accountId, setAccountId] = useState<string | null>(existing?.accountId ?? null);
  const [toAccountId, setToAccountId] = useState<string | null>(existing?.toAccountId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(existing?.frequency ?? 'monthly');
  const [intervalText, setIntervalText] = useState(String(existing?.interval ?? 1));
  // 各频率的锚点分开保存，切频率不丢已选值
  const [weeklyAnchor, setWeeklyAnchor] = useState(
    existing?.frequency === 'weekly' ? existing.anchor : 1,
  );
  const [monthlyAnchor, setMonthlyAnchor] = useState(
    existing?.frequency === 'monthly' ? existing.anchor : 1,
  );
  const [yearlyMonth, setYearlyMonth] = useState(
    existing?.frequency === 'yearly' ? Math.floor(existing.anchor / 100) : 1,
  );
  const [yearlyDayText, setYearlyDayText] = useState(
    existing?.frequency === 'yearly' ? String(existing.anchor % 100) : '1',
  );
  const [startDate, setStartDate] = useState(existing?.startDate ?? todayKey());
  const [endDateText, setEndDateText] = useState(existing?.endDate ?? '');
  const [autoCreate, setAutoCreate] = useState(existing ? existing.autoCreate === 1 : true);
  const [expandedParent, setExpandedParent] = useState<string | null>(null);

  const { data: accounts = [] } = useAccountBalances();
  const categoryType = type === 'income' ? 'income' : 'expense';
  const { data: categoryTree = [] } = useCategoryTree(categoryType);

  const create = useCreateRule();
  const update = useUpdateRule();
  const remove = useRemoveRule();
  const pending = create.isPending || update.isPending;

  const effectiveAccountId = accountId ?? accounts[0]?.id ?? null;
  const typeColor =
    type === 'expense' ? colors.expense : type === 'income' ? colors.income : colors.transfer;

  function switchType(next: TransactionType) {
    if (next === type) return;
    setType(next);
    setCategoryId(null);
    setExpandedParent(null);
    if (next !== 'transfer') setToAccountId(null);
  }

  function currentAnchor(): number | null {
    switch (frequency) {
      case 'daily':
        return 1; // daily 无锚点，占位
      case 'weekly':
        return weeklyAnchor;
      case 'monthly':
        return monthlyAnchor;
      case 'yearly': {
        const dd = Number(yearlyDayText);
        if (!Number.isInteger(dd) || dd < 1 || dd > 31) return null;
        return yearlyMonth * 100 + dd;
      }
    }
  }

  function handleSave() {
    if (!name.trim()) {
      Alert.alert(zh.recurring.nameRequired);
      return;
    }
    const amount = parseMoneyToCents(amountText);
    if (amount !== null && amount < 0 && type !== 'transfer') {
      promptSwitchOnNegative({
        cents: amount,
        type,
        onSwitch: switchType,
        onAbsAmountText: setAmountText,
      }); // 提示切换；取消则不保存
      return;
    }
    if (amount === null || amount <= 0) {
      Alert.alert(zh.txList.invalidAmount);
      return;
    }
    if (!effectiveAccountId) {
      Alert.alert(zh.txList.needAccount);
      return;
    }
    if (type === 'transfer' && (!toAccountId || toAccountId === effectiveAccountId)) {
      Alert.alert(zh.txList.sameAccount);
      return;
    }
    if (type !== 'transfer' && !categoryId) {
      Alert.alert(zh.txList.needCategory);
      return;
    }
    const interval = Number(intervalText);
    if (!Number.isInteger(interval) || interval < 1) {
      Alert.alert(zh.recurring.invalidInterval);
      return;
    }
    const anchor = currentAnchor();
    if (anchor === null) {
      Alert.alert(zh.recurring.invalidAnchorDay);
      return;
    }
    if (!DATE_RE.test(startDate)) {
      Alert.alert(zh.recurring.invalidStartDate);
      return;
    }
    const endDate = endDateText.trim() === '' ? null : endDateText.trim();
    if (endDate !== null && (!DATE_RE.test(endDate) || endDate < startDate)) {
      Alert.alert(zh.recurring.invalidEndDate);
      return;
    }
    const input: RecurringInput = {
      name: name.trim(),
      type,
      amount,
      accountId: effectiveAccountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: type === 'transfer' ? null : categoryId,
      note: note.trim(),
      frequency,
      interval,
      anchor,
      startDate,
      endDate,
      autoCreate,
    };
    const done = {
      onSuccess: () => router.back(),
      onError: (e: Error) => Alert.alert(zh.common.error, e.message),
    };
    if (existing) update.mutate({ id: existing.id, input }, done);
    else create.mutate(input, done);
  }

  function handleDelete() {
    if (!existing) return;
    Alert.alert(zh.common.delete, zh.recurring.deleteConfirm, [
      { text: zh.common.cancel, style: 'cancel' },
      {
        text: zh.common.delete,
        style: 'destructive',
        onPress: () => remove.mutate(existing.id, { onSuccess: () => router.back() }),
      },
    ]);
  }

  function renderChip(
    key: string | number,
    label: string,
    selected: boolean,
    onPress: () => void,
    color = colors.primary,
  ) {
    return (
      <Pressable
        key={key}
        style={[
          styles.chip,
          { borderColor: colors.border },
          selected && { backgroundColor: color, borderColor: color },
        ]}
        onPress={onPress}
      >
        <Text style={{ color: selected ? '#FFFFFF' : colors.text, fontSize: 13 }}>{label}</Text>
      </Pressable>
    );
  }

  const expandedNode = categoryTree.find((n) => n.id === expandedParent);

  return (
    <>
      <Stack.Screen options={{ title: existing ? zh.recurring.edit : zh.recurring.add }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 名称 */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{zh.recurring.name}</Text>
          <TextInput
            style={styles.textInput}
            value={name}
            onChangeText={setName}
            placeholder={zh.recurring.namePlaceholder}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {/* 类型 */}
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
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{zh.tx.amount}</Text>
          <TextInput
            style={[styles.textInput, { color: typeColor, fontWeight: '600' }]}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder={zh.txList.amountPlaceholder}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {/* 账户 */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>
            {type === 'transfer' ? zh.tx.fromAccount : zh.tx.account}
          </Text>
          <View style={styles.chipWrap}>
            {accounts.map((a) =>
              renderChip(a.id, `${a.icon} ${a.name}`, effectiveAccountId === a.id, () =>
                setAccountId(a.id),
              ),
            )}
          </View>
        </View>

        {/* 转入账户 */}
        {type === 'transfer' && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>{zh.tx.toAccount}</Text>
            <View style={styles.chipWrap}>
              {accounts
                .filter((a) => a.id !== effectiveAccountId)
                .map((a) =>
                  renderChip(
                    a.id,
                    `${a.icon} ${a.name}`,
                    toAccountId === a.id,
                    () => setToAccountId(a.id),
                    colors.transfer,
                  ),
                )}
            </View>
          </View>
        )}

        {/* 分类 */}
        {type !== 'transfer' && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>{zh.tx.category}</Text>
            <View style={styles.chipWrap}>
              {categoryTree.map((node) =>
                renderChip(
                  node.id,
                  `${node.icon} ${node.name}`,
                  categoryId === node.id || node.children.some((c) => c.id === categoryId),
                  () => {
                    setCategoryId(node.id);
                    setExpandedParent(node.children.length > 0 ? node.id : null);
                  },
                  typeColor,
                ),
              )}
            </View>
            {expandedNode && expandedNode.children.length > 0 && (
              <View style={[styles.chipWrap, styles.subRow]}>
                {expandedNode.children.map((child) =>
                  renderChip(
                    child.id,
                    child.name,
                    categoryId === child.id,
                    () => setCategoryId(child.id),
                    typeColor,
                  ),
                )}
              </View>
            )}
          </View>
        )}

        {/* 频率 + 间隔 + 锚点 */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{zh.recurring.frequency}</Text>
          <View style={styles.chipWrap}>
            {FREQ_TABS.map((f) =>
              renderChip(f.key, f.label, frequency === f.key, () => setFrequency(f.key)),
            )}
          </View>

          <Text style={styles.sectionLabel2}>{zh.recurring.interval}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: colors.text }}>每</Text>
            <TextInput
              style={[styles.textInput, { width: 64, textAlign: 'center' }]}
              value={intervalText}
              onChangeText={setIntervalText}
              keyboardType="number-pad"
            />
            <Text style={{ color: colors.text }}>{zh.recurring.intervalUnits[frequency]}</Text>
          </View>

          {frequency === 'weekly' && (
            <>
              <Text style={styles.sectionLabel2}>{zh.recurring.anchorWeekly}</Text>
              <View style={styles.chipWrap}>
                {WEEKDAYS.map((label, i) =>
                  renderChip(i + 1, label, weeklyAnchor === i + 1, () => setWeeklyAnchor(i + 1)),
                )}
              </View>
            </>
          )}

          {frequency === 'monthly' && (
            <>
              <Text style={styles.sectionLabel2}>{zh.recurring.anchorMonthly}</Text>
              <View style={styles.chipWrap}>
                {MONTH_DAYS.map((d) =>
                  renderChip(
                    d,
                    d === 31 ? zh.recurring.monthEnd : String(d),
                    monthlyAnchor === d,
                    () => setMonthlyAnchor(d),
                  ),
                )}
              </View>
            </>
          )}

          {frequency === 'yearly' && (
            <>
              <Text style={styles.sectionLabel2}>{zh.recurring.anchorYearlyMonth}</Text>
              <View style={styles.chipWrap}>
                {MONTHS.map((m) =>
                  renderChip(m, `${m}月`, yearlyMonth === m, () => setYearlyMonth(m)),
                )}
              </View>
              <Text style={styles.sectionLabel2}>{zh.recurring.anchorYearlyDay}</Text>
              <TextInput
                style={[styles.textInput, { width: 96, textAlign: 'center' }]}
                value={yearlyDayText}
                onChangeText={setYearlyDayText}
                keyboardType="number-pad"
                placeholder="1-31"
                placeholderTextColor={colors.textSecondary}
              />
            </>
          )}
        </View>

        {/* 日期 */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{zh.recurring.startDate}</Text>
          <TextInput
            style={styles.textInput}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={styles.sectionLabel2}>{zh.recurring.endDate}</Text>
          <TextInput
            style={styles.textInput}
            value={endDateText}
            onChangeText={setEndDateText}
            placeholder={zh.recurring.endDatePlaceholder}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {/* 自动入账 + 备注 */}
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: colors.text, fontSize: 15 }}>{zh.recurring.autoCreate}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3 }}>
                {zh.recurring.autoCreateHint}
              </Text>
            </View>
            <Switch
              value={autoCreate}
              onValueChange={setAutoCreate}
              trackColor={{ true: colors.primary }}
            />
          </View>
          <Text style={styles.sectionLabel2}>{zh.tx.note}</Text>
          <TextInput
            style={styles.textInput}
            value={note}
            onChangeText={setNote}
            placeholder={zh.tx.notePlaceholder}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <Pressable
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: pending ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={pending}
        >
          <Text style={styles.saveBtnText}>{zh.common.save}</Text>
        </Pressable>
        {existing && (
          <Pressable style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={{ color: colors.expense, fontSize: 15 }}>{zh.common.delete}</Text>
          </Pressable>
        )}
      </ScrollView>
    </>
  );
}

function makeStyles({ colors }: AppTheme) {
  return StyleSheet.create({
    card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 12 },
    sectionLabel: { color: colors.textSecondary, fontSize: 13, marginBottom: 8 },
    sectionLabel2: { color: colors.textSecondary, fontSize: 13, marginBottom: 8, marginTop: 14 },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 4,
      marginBottom: 12,
    },
    segmentItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    subRow: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
    textInput: {
      color: colors.text,
      fontSize: 15,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
    },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
    saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    deleteBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  });
}
