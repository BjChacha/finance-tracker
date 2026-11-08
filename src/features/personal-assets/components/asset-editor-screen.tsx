import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { showDialog } from '@/components/dialog';
import { confirmDiscard } from '@/components/form/confirm-discard';
import { FormActionBar } from '@/components/form/form-action-bar';
import { SingleLineTextInput } from '@/components/single-line-text-input';
import { DatePickerField } from '@/components/date-picker';
import { Icon } from '@/components/Icon';
import { SecondarySheetScreen } from '@/components/navigation/secondary-sheet-screen';
import { useAccountBalances } from '@/features/accounts';
import { useCategoryTree } from '@/features/categories';
import { useTransaction } from '@/features/transactions';
import { zh } from '@/i18n/zh';
import { dayjs, todayKey } from '@/lib/date';
import { formatCents, formatCentsWithSymbol, parseMoneyToCents } from '@/lib/money';
import { useTheme } from '@/theme';
import {
  ASSET_CATEGORY_DEFINITIONS,
  buildInstallmentPlan,
  useAsset,
  useAssetsFromTransaction,
  useCreateAsset,
  useCreateInstallmentAsset,
  useUpdateAsset,
  validateInstallmentInput,
  type AssetInput,
  type InstallmentInterestMode,
  type InstallmentPlanInput,
  type PersonalAsset,
} from '..';
import { validateAssetInput } from '../repository';

type FormState = {
  name: string;
  category: string;
  quantityText: string;
  costText: string;
  valueText: string;
  acquiredDateText: string;
  note: string;
  sourceTransactionId: string | null;
};

type InstallmentFormState = {
  enabled: boolean;
  downPaymentText: string;
  periodsText: string;
  interestMode: InstallmentInterestMode;
  totalInterestText: string;
  annualRateText: string;
  firstDueDateKey: string;
  accountId: string | null;
  categoryId: string | null;
  autoCreate: boolean;
};

function defaultInstallmentState(acquiredDateKey = todayKey()): InstallmentFormState {
  return {
    enabled: false,
    downPaymentText: '',
    periodsText: '12',
    interestMode: 'total',
    totalInterestText: '',
    annualRateText: '',
    firstDueDateKey: dayjs(acquiredDateKey).add(1, 'month').format('YYYY-MM-DD'),
    accountId: null,
    categoryId: null,
    autoCreate: true,
  };
}

function initialFormState(): FormState {
  return {
    name: '',
    category: 'other',
    quantityText: '1',
    costText: '',
    valueText: '',
    acquiredDateText: todayKey(),
    note: '',
    sourceTransactionId: null,
  };
}

function formStateFromAsset(asset: PersonalAsset): FormState {
  return {
    name: asset.name,
    category: asset.category,
    quantityText: String(asset.quantity),
    costText: formatCents(asset.costCents, { grouping: false }),
    valueText: formatCents(asset.currentValueCents, { grouping: false }),
    acquiredDateText: asset.acquiredDateKey,
    note: asset.note,
    sourceTransactionId: asset.sourceTransactionId,
  };
}

function parseQuantity(text: string): number | null {
  const n = Number(text.trim());
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}

/**
 * 新增/编辑个人资产。`assetId` 存在时为编辑；`fromTransactionId` 存在时
 * 等对应支出加载完成后预填（名称取备注/分类、成本取本位币金额、日期取交易日期）。
 */
export function AssetEditorScreen({
  assetId,
  fromTransactionId,
}: {
  assetId?: string;
  fromTransactionId?: string;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const copy = zh.personalAssets;

  const editing = Boolean(assetId);
  const assetQuery = useAsset(assetId ?? '');
  const asset = assetQuery.data ?? null;
  const txQuery = useTransaction(fromTransactionId ?? '');
  const tx = txQuery.data ?? null;
  const existingFromTx = useAssetsFromTransaction(fromTransactionId ?? '');

  const [form, setForm] = useState<FormState>(initialFormState);
  const [installment, setInstallment] = useState<InstallmentFormState>(() => defaultInstallmentState());
  const [prefillBanner, setPrefillBanner] = useState<{ amount: number; dateKey: string } | null>(null);
  const hydratedRef = useRef(false);
  const dupPromptedRef = useRef(false);
  const installmentDefaultsRef = useRef(false);
  const create = useCreateAsset();
  const createInstallment = useCreateInstallmentAsset();
  const update = useUpdateAsset();

  const accountsQuery = useAccountBalances();
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const expenseTree = useCategoryTree('expense');
  const expenseCategories = useMemo(
    () => (expenseTree.data ?? []).filter((node) => !node.parentId),
    [expenseTree.data],
  );

  // 分期段默认账户/分类：来源支出账户 > 第一个账户；分类默认「购物」> 第一个一级支出分类
  useEffect(() => {
    if (installmentDefaultsRef.current || editing) return;
    if (accounts.length === 0 || expenseCategories.length === 0) return;
    installmentDefaultsRef.current = true;
    setInstallment((current) => ({
      ...current,
      accountId: current.accountId ?? tx?.accountId ?? accounts[0]!.id,
      categoryId:
        current.categoryId ??
        expenseCategories.find((c) => c.name === '购物')?.id ??
        expenseCategories[0]!.id,
    }));
  }, [accounts, editing, expenseCategories, tx?.accountId]);

  // 取得日期变化时，若首期日不晚于取得日则自动顺延一个月（仅在分期开启时校正）
  useEffect(() => {
    if (!installment.enabled) return;
    setInstallment((current) =>
      current.firstDueDateKey <= form.acquiredDateText
        ? {
            ...current,
            firstDueDateKey: dayjs(form.acquiredDateText).add(1, 'month').format('YYYY-MM-DD'),
          }
        : current,
    );
  }, [form.acquiredDateText, installment.enabled]);

  // 编辑模式：资产加载完成后回填一次；若用户已抢先输入则不覆盖
  useEffect(() => {
    if (!editing || !asset || hydratedRef.current) return;
    hydratedRef.current = true;
    setForm((current) =>
      JSON.stringify(current) === JSON.stringify(initialFormState())
        ? formStateFromAsset(asset)
        : current,
    );
  }, [asset, editing]);

  // 从支出生成：交易加载完成后预填一次；用户已输入时仅补来源关联
  useEffect(() => {
    if (editing || !tx || hydratedRef.current) return;
    hydratedRef.current = true;
    const fallbackName = tx.note.trim() || tx.categoryName || '';
    const cost = tx.amountBaseCents;
    setForm((current) => {
      if (JSON.stringify(current) !== JSON.stringify(initialFormState())) {
        return current.sourceTransactionId ? current : { ...current, sourceTransactionId: tx.id };
      }
      return {
        ...initialFormState(),
        name: fallbackName,
        costText: cost > 0 ? formatCents(cost, { grouping: false }) : '',
        acquiredDateText: tx.dateKey,
        sourceTransactionId: tx.id,
      };
    });
    setPrefillBanner({ amount: cost, dateKey: tx.dateKey });
  }, [editing, tx]);

  // 该支出已生成过资产：提示一次（可继续，允许多件资产出自同一笔支出）
  useEffect(() => {
    if (!fromTransactionId || dupPromptedRef.current) return;
    const existing = existingFromTx.data;
    if (!existing || existing.length === 0) return;
    dupPromptedRef.current = true;
    showDialog(copy.fromTxExists(existing.length), copy.fromTxExistsConfirm, [
      { text: zh.common.cancel, style: 'cancel' },
    ]);
  }, [copy, existingFromTx.data, fromTransactionId]);

  const initialSnapshot = useMemo(() => {
    if (editing && asset) return JSON.stringify(formStateFromAsset(asset));
    return JSON.stringify(initialFormState());
  }, [asset, editing]);

  const dirty = JSON.stringify(form) !== initialSnapshot || (!editing && installment.enabled);

  function buildInput(): AssetInput | string {
    const costCents = parseMoneyToCents(form.costText);
    if (costCents === null) return zh.txList.invalidAmount;
    const valueCents = form.valueText.trim() === '' ? costCents : parseMoneyToCents(form.valueText);
    if (valueCents === null) return zh.txList.invalidAmount;
    const quantity = parseQuantity(form.quantityText);
    if (quantity === null) return copy.quantity;
    const input: AssetInput = {
      name: form.name,
      category: form.category,
      quantity,
      costCents,
      currentValueCents: valueCents,
      acquiredDateKey: form.acquiredDateText.trim(),
      note: form.note,
      sourceTransactionId: form.sourceTransactionId,
    };
    const error = validateAssetInput(input);
    if (error) return error;
    return input;
  }

  /** 分期计划入参（仅新建且开启分期时有效）；返回错误文案或入参 */
  function buildInstallmentPlanInput(
    totalCents: number,
  ): { planInput: InstallmentPlanInput } | string {
    const downCents =
      installment.downPaymentText.trim() === ''
        ? 0
        : parseMoneyToCents(installment.downPaymentText);
    if (downCents === null) return copy.installmentDownPaymentBad;
    const periods = Number(installment.periodsText.trim());
    let totalInterestCents: number | null = null;
    let annualRateScaled: number | null = null;
    if (installment.interestMode === 'total') {
      const interest = installment.totalInterestText.trim() === ''
        ? 0
        : parseMoneyToCents(installment.totalInterestText);
      if (interest === null) return copy.installmentTotalInterestBad;
      totalInterestCents = interest;
    } else {
      const rate = Number(installment.annualRateText.trim());
      if (!Number.isFinite(rate) || rate < 0) return copy.installmentAnnualRateBad;
      annualRateScaled = Math.round(rate * 100);
    }
    const planInput: InstallmentPlanInput = {
      totalCents,
      downPaymentCents: downCents,
      periods,
      interestMode: installment.interestMode,
      totalInterestCents,
      annualRateScaled,
    };
    const error = validateInstallmentInput(planInput, {
      acquiredDateKey: form.acquiredDateText.trim(),
      firstDueDateKey: installment.firstDueDateKey,
    });
    if (error) return error;
    return { planInput };
  }

  /** 实时预览（分期开启且总价可解析时） */
  const installmentPreview = useMemo(() => {
    if (!installment.enabled || editing) return null;
    const totalCents = parseMoneyToCents(form.costText);
    if (totalCents === null || totalCents <= 0) return null;
    const built = buildInstallmentPlanInput(totalCents);
    if (typeof built === 'string') return { error: built };
    try {
      return {
        plan: buildInstallmentPlan(built.planInput, installment.firstDueDateKey),
        error: null,
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    editing,
    form.costText,
    installment.downPaymentText,
    installment.enabled,
    installment.firstDueDateKey,
    installment.interestMode,
    installment.periodsText,
    installment.totalInterestText,
    installment.annualRateText,
    form.acquiredDateText,
  ]);

  async function handleSave(): Promise<void> {
    const input = buildInput();
    if (typeof input === 'string') {
      showDialog(zh.common.error, input);
      return;
    }
    if (editing && assetId) {
      await update.mutateAsync({ id: assetId, input });
      return;
    }
    // 新建：分期购买
    if (installment.enabled) {
      const built = buildInstallmentPlanInput(input.costCents);
      if (typeof built === 'string') {
        showDialog(zh.common.error, built);
        return;
      }
      if (!installment.accountId) {
        showDialog(zh.common.error, copy.installmentNeedAccount);
        return;
      }
      if (!installment.categoryId) {
        showDialog(zh.common.error, copy.installmentNeedCategory);
        return;
      }
      const newId = await createInstallment.mutateAsync({
        asset: input,
        plan: built.planInput,
        firstDueDateKey: installment.firstDueDateKey,
        accountId: installment.accountId,
        categoryId: installment.categoryId,
        autoCreate: installment.autoCreate,
      });
      router.replace(`/personal-assets/${newId}`);
      return;
    }
    const newId = await create.mutateAsync(input);
    // 新建后落到详情页，方便接着走估值/出售等生命周期操作（替换当前编辑路由）
    router.replace(`/personal-assets/${newId}`);
  }

  const pending = create.isPending || createInstallment.isPending || update.isPending;

  return (
    <SecondarySheetScreen
      title={editing ? copy.edit : copy.add}
      onBeforeDismiss={async () => (dirty ? confirmDiscard() : true)}
    >
      {({ dismiss }) => (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
          >
            {prefillBanner && (
              <View
                testID="asset-prefill-banner"
                style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Icon name="circle-check-big" size={18} color={colors.income} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                    {copy.fromTxBanner}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                    {formatCentsWithSymbol(prefillBanner.amount)} · {prefillBanner.dateKey}
                  </Text>
                </View>
              </View>
            )}

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{copy.name}</Text>
            <SingleLineTextInput
              testID="asset-name-input"
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              value={form.name}
              onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
              placeholder={copy.namePlaceholder}
              placeholderTextColor={colors.textSecondary}
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{copy.category}</Text>
            <View style={styles.chipWrap}>
              {ASSET_CATEGORY_DEFINITIONS.map((def) => {
                const selected = form.category === def.key;
                return (
                  <Pressable
                    key={def.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={def.label}
                    style={[
                      styles.chip,
                      { borderColor: selected ? def.color : colors.border },
                      selected && { backgroundColor: def.color },
                    ]}
                    onPress={() => setForm((f) => ({ ...f, category: def.key }))}
                  >
                    <Icon name={def.icon} size={14} color={selected ? colors.onPrimary : def.color} />
                    <Text
                      style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 13 }}
                      numberOfLines={1}
                    >
                      {def.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  {copy.quantity}
                </Text>
                <SingleLineTextInput
                  testID="asset-quantity-input"
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  value={form.quantityText}
                  onChangeText={(t) =>
                    setForm((f) => ({ ...f, quantityText: t.replace(/[^\d]/g, '') }))
                  }
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <View style={{ flex: 1.6 }}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  {copy.acquiredDate}
                </Text>
                <DatePickerField
                  value={form.acquiredDateText}
                  onPick={(dateKey) => setForm((f) => ({ ...f, acquiredDateText: dateKey }))}
                />
              </View>
            </View>

            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  {copy.cost}
                </Text>
                <SingleLineTextInput
                  testID="asset-cost-input"
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  value={form.costText}
                  onChangeText={(t) => setForm((f) => ({ ...f, costText: t }))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  {copy.value}
                </Text>
                <SingleLineTextInput
                  testID="asset-value-input"
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  value={form.valueText}
                  onChangeText={(t) => setForm((f) => ({ ...f, valueText: t }))}
                  keyboardType="decimal-pad"
                  placeholder={form.costText || '0.00'}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{copy.note}</Text>
            <SingleLineTextInput
              testID="asset-note-input"
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              value={form.note}
              onChangeText={(t) => setForm((f) => ({ ...f, note: t }))}
              placeholder={copy.notePlaceholder}
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
            />

            {/* 分期购买（仅新建可编辑；已有分期参数只读） */}
            {!editing ? (
              <View
                style={[styles.installmentCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.installmentHeader}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                      {copy.installmentToggle}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {copy.installmentHint}
                    </Text>
                  </View>
                  <Switch
                    testID="asset-installment-switch"
                    value={installment.enabled}
                    onValueChange={(v) =>
                      setInstallment((s) => ({ ...s, enabled: v }))
                    }
                    trackColor={{ true: colors.primary }}
                  />
                </View>

                {installment.enabled && (
                  <>
                    <View style={styles.twoCol}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                          {copy.installmentDownPayment}
                        </Text>
                        <SingleLineTextInput
                          testID="asset-installment-down-payment"
                          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                          value={installment.downPaymentText}
                          onChangeText={(t) => setInstallment((s) => ({ ...s, downPaymentText: t }))}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                          {copy.installmentPeriods}
                        </Text>
                        <SingleLineTextInput
                          testID="asset-installment-periods"
                          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                          value={installment.periodsText}
                          onChangeText={(t) =>
                            setInstallment((s) => ({ ...s, periodsText: t.replace(/[^\d]/g, '') }))
                          }
                          keyboardType="number-pad"
                          placeholder="12"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>
                    </View>

                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                      {copy.installmentInterestMode}
                    </Text>
                    <View style={styles.chipWrap}>
                      {(
                        [
                          ['total', copy.installmentModeTotal],
                          ['annual-rate', copy.installmentModeRate],
                        ] as const
                      ).map(([mode, label]) => {
                        const selected = installment.interestMode === mode;
                        return (
                          <Pressable
                            key={mode}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={label}
                            style={[
                              styles.chip,
                              { borderColor: selected ? colors.primary : colors.border },
                              selected && { backgroundColor: colors.primary },
                            ]}
                            onPress={() => setInstallment((s) => ({ ...s, interestMode: mode }))}
                          >
                            <Text style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 13 }}>
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {installment.interestMode === 'total' ? (
                      <>
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                          {copy.installmentTotalInterest}
                        </Text>
                        <SingleLineTextInput
                          testID="asset-installment-interest"
                          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                          value={installment.totalInterestText}
                          onChangeText={(t) => setInstallment((s) => ({ ...s, totalInterestText: t }))}
                          keyboardType="decimal-pad"
                          placeholder="0.00（免息）"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </>
                    ) : (
                      <>
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                          {copy.installmentAnnualRate}
                        </Text>
                        <SingleLineTextInput
                          testID="asset-installment-rate"
                          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                          value={installment.annualRateText}
                          onChangeText={(t) => setInstallment((s) => ({ ...s, annualRateText: t }))}
                          keyboardType="decimal-pad"
                          placeholder="如 12.5"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </>
                    )}

                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                      {copy.installmentFirstDue}
                    </Text>
                    <DatePickerField
                      value={installment.firstDueDateKey}
                      onPick={(dateKey) => setInstallment((s) => ({ ...s, firstDueDateKey: dateKey }))}
                    />

                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                      {copy.installmentAccount}
                    </Text>
                    <View style={styles.chipWrap}>
                      {accounts.map((account) => {
                        const selected = installment.accountId === account.id;
                        return (
                          <Pressable
                            key={account.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={account.name}
                            style={[
                              styles.chip,
                              { borderColor: selected ? colors.primary : colors.border },
                              selected && { backgroundColor: colors.primary },
                            ]}
                            onPress={() => setInstallment((s) => ({ ...s, accountId: account.id }))}
                          >
                            <Text
                              style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 13 }}
                              numberOfLines={1}
                            >
                              {account.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                      {copy.installmentCategory}
                    </Text>
                    <View style={styles.chipWrap}>
                      {expenseCategories.map((category) => {
                        const selected = installment.categoryId === category.id;
                        return (
                          <Pressable
                            key={category.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={category.name}
                            style={[
                              styles.chip,
                              { borderColor: selected ? colors.primary : colors.border },
                              selected && { backgroundColor: colors.primary },
                            ]}
                            onPress={() => setInstallment((s) => ({ ...s, categoryId: category.id }))}
                          >
                            <Text
                              style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 13 }}
                              numberOfLines={1}
                            >
                              {category.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                      {copy.installmentAutoCreateMode}
                    </Text>
                    <View style={styles.chipWrap}>
                      {(
                        [
                          [true, copy.installmentAutoCreate],
                          [false, copy.installmentPendingMode],
                        ] as const
                      ).map(([auto, label]) => {
                        const selected = installment.autoCreate === auto;
                        return (
                          <Pressable
                            key={String(auto)}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={label}
                            style={[
                              styles.chip,
                              { borderColor: selected ? colors.primary : colors.border },
                              selected && { backgroundColor: colors.primary },
                            ]}
                            onPress={() => setInstallment((s) => ({ ...s, autoCreate: auto }))}
                          >
                            <Text style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 13 }}>
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {/* 实时预览 */}
                    <View style={[styles.installmentPreview, { borderColor: colors.border }]}>
                      {installmentPreview?.error ? (
                        <Text style={{ color: colors.expense, fontSize: 12 }}>
                          {installmentPreview.error}
                        </Text>
                      ) : installmentPreview?.plan ? (
                        <>
                          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                            {copy.installmentPreview(
                              formatCentsWithSymbol(installmentPreview.plan.perPeriodCents),
                              Number(installment.periodsText),
                            )}
                          </Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                            {copy.installmentPreviewDetail(
                              formatCentsWithSymbol(installmentPreview.plan.totalInterestCents),
                              installmentPreview.plan.endDateKey,
                            )}
                          </Text>
                        </>
                      ) : (
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                          {copy.installmentPreviewHint}
                        </Text>
                      )}
                    </View>
                  </>
                )}
              </View>
            ) : asset && asset.installmentPeriods > 0 ? (
              <View
                style={[styles.installmentPreview, { borderColor: colors.border, marginTop: 16 }]}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {copy.installmentReadonlyHint}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <FormActionBar
            label={zh.common.save}
            icon="check"
            pending={pending}
            keyboardAware={false}
            onPress={() =>
              void handleSave().then(() => {
                if (editing) dismiss();
              })
            }
          />
        </View>
      )}
    </SecondarySheetScreen>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 4,
  },
  fieldLabel: { fontSize: 13, marginTop: 16, marginBottom: 8 },
  input: { height: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 15 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  twoCol: { flexDirection: 'row', gap: 12 },
  installmentCard: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  installmentHeader: { flexDirection: 'row', alignItems: 'center' },
  installmentPreview: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
  },
});
