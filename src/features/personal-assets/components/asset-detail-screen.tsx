import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '@/components/dialog';
import { ActionButton } from '@/components/form/action-button';
import { SingleLineTextInput } from '@/components/single-line-text-input';
import { DatePickerField } from '@/components/date-picker';
import { Icon } from '@/components/Icon';
import { IconBubble } from '@/components/IconBubble';
import {
  SecondarySheetScreen,
  SheetHeaderIconButton,
} from '@/components/navigation/secondary-sheet-screen';
import { useResidentEditor } from '@/components/navigation/resident-editor-sheet-host';
import { zh } from '@/i18n/zh';
import { todayKey } from '@/lib/date';
import { formatCents, formatCentsWithSymbol, parseMoneyToCents } from '@/lib/money';
import { useTheme } from '@/theme';
import type { PersonalAsset } from '@/db/schema';
import type { TxListItem } from '@/features/transactions';
import { useAccountBalances } from '@/features/accounts';
import { useRecurringRules } from '@/features/recurring';
import { useTransaction } from '@/features/transactions';
import {
  ASSET_STATUS_COLOR,
  CANDIDATE_RANGE_OPTIONS,
  filterIncomeByKeyword,
  installmentProgress,
  resolveAssetCategory,
  useAsset,
  useDeleteAsset,
  useDisposeAsset,
  useInstallmentPeriods,
  usePersonalAssets,
  useReactivateAsset,
  useSaleIncomeList,
  useSellAssetByTransaction,
  useSellAssetManual,
  useSettleInstallment,
} from '..';

type Panel = 'sell' | 'dispose' | null;
type SellMode = 'manual' | 'link';
/** 关联列表时间窗（近1年为默认：出售通常发生在取得后一年内） */
const INCOME_RANGE_DEFAULT = 365;

/** 资产详情 + 全生命周期操作：出售（双模式）/ 处置 / 恢复 / 删除 */
export function AssetDetailScreen({ assetId }: { assetId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const copy = zh.personalAssets;
  const resident = useResidentEditor();

  const assetQuery = useAsset(assetId);
  const asset = assetQuery.data ?? null;

  const [panel, setPanel] = useState<Panel>(null);
  const [soldText, setSoldText] = useState('');
  const [soldDate, setSoldDate] = useState(todayKey());
  const [disposeDate, setDisposeDate] = useState(todayKey());
  const [sellMode, setSellMode] = useState<SellMode>('manual');
  const [recordIncome, setRecordIncome] = useState(true);
  const [incomeAccountId, setIncomeAccountId] = useState<string | null>(null);
  const [incomeRangeDays, setIncomeRangeDays] = useState(INCOME_RANGE_DEFAULT);
  const [incomeKeyword, setIncomeKeyword] = useState('');
  const sellManual = useSellAssetManual();
  const sellByTx = useSellAssetByTransaction();
  const dispose = useDisposeAsset();
  const reactivate = useReactivateAsset();
  const remove = useDeleteAsset();

  const accountsQuery = useAccountBalances();
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const allAssetsQuery = usePersonalAssets();
  const allAssets = useMemo(() => allAssetsQuery.data ?? [], [allAssetsQuery.data]);
  /** 已被其他资产占用的出售收入（列表灰显 + 禁选） */
  const linkedIncomeIds = useMemo(
    () =>
      new Set(
        allAssets
          .filter((a) => a.id !== assetId && a.soldTransactionId)
          .map((a) => a.soldTransactionId as string),
      ),
    [allAssets, assetId],
  );

  // 默认入账账户：来源支出的账户，无则第一个账户（面板打开时兜底一次）
  const sourceTxQuery = useTransaction(asset?.sourceTransactionId ?? '');
  useEffect(() => {
    if (incomeAccountId || accounts.length === 0) return;
    setIncomeAccountId(
      sourceTxQuery.data?.accountId ?? accounts[0]!.id,
    );
  }, [accounts, incomeAccountId, sourceTxQuery.data]);

  const incomeListQuery = useSaleIncomeList(incomeRangeDays);
  const incomeList = useMemo(() => {
    const rows = incomeListQuery.data ?? [];
    return filterIncomeByKeyword(rows, incomeKeyword).slice(0, 100);
  }, [incomeKeyword, incomeListQuery.data]);

  /* ------------------------------ 分期 ------------------------------ */
  const settle = useSettleInstallment();
  const installmentRuleId = asset?.installmentRuleId ?? null;
  const generatedPeriodsQuery = useInstallmentPeriods(installmentRuleId);
  const rulesQuery = useRecurringRules();
  const installmentRule = useMemo(
    () => (rulesQuery.data ?? []).find((r) => r.id === installmentRuleId) ?? null,
    [installmentRuleId, rulesQuery.data],
  );
  const progress = useMemo(
    () => (asset ? installmentProgress(asset, generatedPeriodsQuery.data ?? null) : null),
    [asset, generatedPeriodsQuery.data],
  );
  const installmentActive =
    asset !== null && asset.installmentPeriods > 0 && !asset.installmentClosedDateKey;

  function confirmSettleInstallment() {
    showDialog(copy.installmentSettle, copy.installmentSettleConfirm, [
      { text: zh.common.cancel, style: 'cancel' },
      {
        text: zh.common.confirm,
        onPress: () => {
          void settle
            .mutateAsync(assetId)
            .catch((e: unknown) => {
              showDialog(zh.common.error, e instanceof Error ? e.message : String(e));
            });
        },
      },
    ]);
  }

  if (!asset) {
    return (
      <SecondarySheetScreen title={copy.detail}>
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary }}>{zh.common.empty}</Text>
        </View>
      </SecondarySheetScreen>
    );
  }

  const categoryDef = resolveAssetCategory(asset.category);
  const holding = asset.status === 'holding';
  const realized = (asset.status === 'sold' ? asset.soldCents ?? 0 : 0) - asset.costCents;

  function resetPanel(next: Panel) {
    setPanel(next);
    setSoldText('');
    setSoldDate(todayKey());
    setDisposeDate(todayKey());
  }

  async function handleSell(): Promise<void> {
    const soldCents = parseMoneyToCents(soldText);
    if (soldCents === null) {
      showDialog(zh.common.error, zh.txList.invalidAmount);
      return;
    }
    if (recordIncome && !incomeAccountId) {
      showDialog(zh.common.error, copy.needAccount);
      return;
    }
    await sellManual.mutateAsync({
      assetId,
      soldCents,
      dateKey: soldDate,
      recordIncome,
      accountId: recordIncome ? (incomeAccountId ?? undefined) : undefined,
    });
    resetPanel(null);
  }

  function confirmLinkSell(tx: TxListItem) {
    showDialog(
      copy.confirmLinkSell,
      copy.confirmLinkSellMsg(formatCentsWithSymbol(tx.amount, tx.currency), tx.dateKey),
      [
        { text: zh.common.cancel, style: 'cancel' },
        {
          text: zh.common.confirm,
          onPress: () => {
            void sellByTx
              .mutateAsync({ assetId, transactionId: tx.id })
              .then(() => resetPanel(null))
              .catch((e: unknown) => {
                showDialog(zh.common.error, e instanceof Error ? e.message : String(e));
              });
          },
        },
      ],
    );
  }

  function handleDispose() {
    showDialog(copy.dispose, copy.disposeConfirmMsg, [
      { text: zh.common.cancel, style: 'cancel' },
      {
        text: zh.common.confirm,
        style: 'destructive',
        onPress: () => {
          void dispose
            .mutateAsync({ assetId, dateKey: disposeDate.trim() })
            .then(() => resetPanel(null))
            .catch((e: unknown) => {
              showDialog(zh.common.error, e instanceof Error ? e.message : String(e));
            });
        },
      },
    ]);
  }

  function confirmDelete() {
    showDialog(zh.common.delete, copy.deleteConfirm, [
      { text: zh.common.cancel, style: 'cancel' },
      {
        text: zh.common.delete,
        style: 'destructive',
        onPress: () => {
          void remove
            .mutateAsync(assetId)
            .then(() => router.back())
            .catch((e: unknown) => {
              showDialog(zh.common.error, e instanceof Error ? e.message : String(e));
            });
        },
      },
    ]);
  }

  const infoRows: Array<{ label: string; value: string; color?: string }> = [
    { label: copy.category, value: categoryDef.label },
    { label: copy.quantity, value: `${asset.quantity} ${copy.quantityUnit}` },
    { label: copy.acquiredDate, value: asset.acquiredDateKey },
    { label: copy.cost, value: formatCentsWithSymbol(asset.costCents) },
  ];
  if (!holding && asset.status === 'sold') {
    infoRows.push({ label: copy.soldAt, value: asset.closedDateKey ?? '—' });
    infoRows.push({ label: copy.soldFor, value: formatCentsWithSymbol(asset.soldCents ?? 0) });
    infoRows.push({
      label: copy.closedGain,
      value: formatCents(realized, { sign: true }),
      color: realized > 0 ? colors.income : realized < 0 ? colors.expense : colors.textSecondary,
    });
  } else if (!holding) {
    infoRows.push({ label: copy.disposedAt, value: asset.closedDateKey ?? '—' });
    infoRows.push({
      label: copy.closedGain,
      value: formatCents(realized, { sign: true }),
      color: colors.expense,
    });
  }

  return (
    <SecondarySheetScreen
      title={copy.detail}
      headerRight={
        <View style={styles.headerActions}>
          <SheetHeaderIconButton
            icon="trash-2"
            label={zh.common.delete}
            color={colors.expense}
            onPress={confirmDelete}
          />
          <SheetHeaderIconButton
            icon="pencil"
            label={zh.common.edit}
            onPress={() => router.push(`/personal-assets/edit?id=${assetId}`)}
          />
        </View>
      }
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 概要卡片 */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.summaryRow}>
            <IconBubble name={categoryDef.icon} color={categoryDef.color} size={44} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }} numberOfLines={2}>
                {asset.name}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {categoryDef.label} · {asset.acquiredDateKey}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {asset.installmentPeriods > 0 && (
                <View
                  style={[
                    styles.statusChip,
                    { backgroundColor: asset.installmentClosedDateKey ? `${colors.textSecondary}22` : `${colors.primary}22` },
                  ]}
                >
                  <Text
                    style={{
                      color: asset.installmentClosedDateKey ? colors.textSecondary : colors.primary,
                      fontSize: 12,
                      fontWeight: '600',
                    }}
                  >
                    {copy.installmentBadge}
                  </Text>
                </View>
              )}
              <View
                style={[
                  styles.statusChip,
                  { backgroundColor: `${ASSET_STATUS_COLOR[asset.status]}22` },
                ]}
              >
                <Text
                  style={{ color: ASSET_STATUS_COLOR[asset.status], fontSize: 12, fontWeight: '600' }}
                >
                  {copy.status[asset.status]}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.infoList, { borderTopColor: colors.border }]}>
            {infoRows.map((row) => (
              <View key={row.label} style={styles.infoRow}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{row.label}</Text>
                <Text
                  style={{ color: row.color ?? colors.text, fontSize: 13, fontWeight: '500' }}
                  numberOfLines={1}
                >
                  {row.value}
                </Text>
              </View>
            ))}
            {asset.sourceTransactionId && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.viewSourceTx}
                style={[styles.infoRow, { minHeight: 44 }]}
                onPress={() => resident.openTransaction(asset.sourceTransactionId!)}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{copy.generatedFrom}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: colors.primary, fontSize: 13 }}>{copy.viewSourceTx}</Text>
                  <Icon name="chevron-right" size={16} color={colors.primary} />
                </View>
              </Pressable>
            )}
            {asset.soldTransactionId && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.viewSoldIncome}
                style={[styles.infoRow, { minHeight: 44 }]}
                onPress={() => resident.openTransaction(asset.soldTransactionId!)}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{copy.soldIncomeLabel}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: colors.primary, fontSize: 13 }}>{copy.viewSoldIncome}</Text>
                  <Icon name="chevron-right" size={16} color={colors.primary} />
                </View>
              </Pressable>
            )}
            {asset.note !== '' && (
              <View style={styles.infoRow}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{copy.note}</Text>
                <Text style={{ color: colors.text, fontSize: 13, flex: 1, textAlign: 'right' }}>
                  {asset.note}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* 分期计划 */}
        {progress && (
          <View style={[styles.card, { backgroundColor: colors.card }]} testID="asset-installment-card">
            <View style={styles.installmentTitleRow}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                {copy.installmentCardTitle}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {progress.settled
                  ? copy.installmentSettled(asset.installmentClosedDateKey ?? '')
                  : copy.installmentProgressLabel(progress.paidPeriods, progress.periods)}
              </Text>
            </View>

            {/* 进度条 */}
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: progress.settled ? colors.textSecondary : colors.primary,
                    width: `${Math.min(100, (progress.paidPeriods / progress.periods) * 100)}%`,
                  },
                ]}
              />
            </View>

            <View style={styles.installmentGrid}>
              {[
                { label: copy.installmentPerPeriod, value: formatCentsWithSymbol(progress.perPeriodCents) },
                { label: copy.installmentPaid, value: formatCentsWithSymbol(progress.paidCents) },
                { label: copy.installmentRemaining, value: formatCentsWithSymbol(progress.remainingCents) },
                {
                  label: copy.installmentTotalInterest,
                  value: formatCentsWithSymbol(asset.installmentInterestCents),
                },
                { label: copy.installmentFirstDueLabel, value: asset.installmentFirstDueDateKey ?? '—' },
                {
                  label: copy.installmentNextDue,
                  value: progress.settled ? '—' : (progress.nextDueDateKey ?? '—'),
                },
              ].map((cell) => (
                <View key={cell.label} style={styles.installmentCell}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }} numberOfLines={1}>
                    {cell.label}
                  </Text>
                  <Text
                    style={{ color: colors.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {cell.value}
                  </Text>
                </View>
              ))}
            </View>

            {installmentRule && (
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8 }}>
                {installmentRule.accountName ?? ''}
                {installmentRule.categoryName ? ` · ${installmentRule.categoryName}` : ''}
                {installmentRule.endDate ? ` · 末期 ${installmentRule.endDate}` : ''}
              </Text>
            )}

            {asset.installmentDownPaymentTransactionId && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.viewSoldIncome}
                style={[styles.infoRow, { minHeight: 44, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
                onPress={() => resident.openTransaction(asset.installmentDownPaymentTransactionId!)}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{copy.installmentDownPayment}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: colors.primary, fontSize: 13 }}>{zh.common.view}</Text>
                  <Icon name="chevron-right" size={16} color={colors.primary} />
                </View>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.installmentRuleEntry}
              style={[styles.infoRow, { minHeight: 44 }]}
              onPress={() => {
                if (!installmentRuleId) return;
                if (installmentRule) {
                  router.push(`/recurring/edit?id=${installmentRuleId}`);
                } else {
                  showDialog(copy.installmentRuleEntry, copy.installmentRuleMissing);
                }
              }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{copy.installmentRuleEntry}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ color: colors.primary, fontSize: 13 }}>
                  {installmentRule ? zh.common.view : copy.installmentRuleMissing}
                </Text>
                {installmentRule && <Icon name="chevron-right" size={16} color={colors.primary} />}
              </View>
            </Pressable>

            {installmentActive && (
              <ActionButton
                label={copy.installmentSettle}
                pending={settle.isPending}
                onPress={confirmSettleInstallment}
              />
            )}
          </View>
        )}
        {/* 生命周期操作 */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {holding ? (
            <>
              <View style={styles.actionRow}>

                <LifecycleAction
                  icon="hand-coins"
                  label={copy.sell}
                  color={colors.income}
                  active={panel === 'sell'}
                  onPress={() =>
                    installmentActive
                      ? showDialog(copy.sell, copy.installmentBlockExit)
                      : resetPanel(panel === 'sell' ? null : 'sell')
                  }
                />
                <LifecycleAction
                  icon="archive"
                  label={copy.dispose}
                  color={ASSET_STATUS_COLOR.disposed}
                  active={panel === 'dispose'}
                  onPress={() =>
                    installmentActive
                      ? showDialog(copy.dispose, copy.installmentBlockExit)
                      : resetPanel(panel === 'dispose' ? null : 'dispose')
                  }
                />
              </View>

              {panel === 'sell' && (
                <View style={styles.panel} testID="asset-sell-panel">
                  {/* 模式切换 */}
                  <View style={[styles.sellModeSegment, { backgroundColor: colors.card }]}>
                    {(['manual', 'link'] as const).map((key) => {
                      const active = sellMode === key;
                      return (
                        <Pressable
                          key={key}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={key === 'manual' ? copy.sellModeManual : copy.sellModeLink}
                          style={[styles.sellModeItem, active && { backgroundColor: colors.primary }]}
                          onPress={() => setSellMode(key)}
                        >
                          <Text
                            style={{
                              color: active ? colors.onPrimary : colors.textSecondary,
                              fontSize: 13,
                              fontWeight: '600',
                            }}
                          >
                            {key === 'manual' ? copy.sellModeManual : copy.sellModeLink}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {sellMode === 'manual' ? (
                    <>
                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                        {copy.sellAmountLabel}
                      </Text>
                      <SingleLineTextInput
                        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                        value={soldText}
                        onChangeText={setSoldText}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={colors.textSecondary}
                      />
                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                        {copy.soldAt}
                      </Text>
                      <DatePickerField value={soldDate} onPick={setSoldDate} />

                      {/* 自动记一笔收入 */}
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: recordIncome }}
                        accessibilityLabel={copy.recordIncomeLabel}
                        onPress={() => setRecordIncome((v) => !v)}
                        style={styles.checkboxRow}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            { borderColor: recordIncome ? colors.primary : colors.border },
                            recordIncome && { backgroundColor: colors.primary },
                          ]}
                        >
                          {recordIncome && <Icon name="check" size={14} color={colors.onPrimary} />}
                        </View>
                        <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>
                          {copy.recordIncomeLabel}（{copy.recordIncomeCategory}）
                        </Text>
                      </Pressable>
                      {recordIncome && (
                        <>
                          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                            {copy.recordInto}
                          </Text>
                          <View style={styles.accountChips}>
                            {accounts.map((account) => {
                              const selected = incomeAccountId === account.id;
                              return (
                                <Pressable
                                  key={account.id}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected }}
                                  accessibilityLabel={account.name}
                                  style={[
                                    styles.accountChip,
                                    { borderColor: selected ? colors.primary : colors.border },
                                    selected && { backgroundColor: colors.primary },
                                  ]}
                                  onPress={() => setIncomeAccountId(account.id)}
                                >
                                  <Text
                                    style={{
                                      color: selected ? colors.onPrimary : colors.text,
                                      fontSize: 13,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {account.name}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          {incomeAccountId && (
                            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>
                              {copy.recordSummary(
                                accounts.find((a) => a.id === incomeAccountId)?.name ?? '',
                              )}
                            </Text>
                          )}
                        </>
                      )}
                      <ActionButton
                        label={copy.confirmSell}
                        pending={sellManual.isPending}
                        onPress={handleSell}
                      />
                    </>
                  ) : (
                    <>
                      {/* 时间快捷筛选 */}
                      <View style={styles.incomeRangeRow}>
                        {CANDIDATE_RANGE_OPTIONS.map((days) => {
                          const active = incomeRangeDays === days;
                          return (
                            <Pressable
                              key={days}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                              accessibilityLabel={copy.candidateRange(days)}
                              onPress={() => setIncomeRangeDays(days)}
                              style={[
                                styles.incomeRangeChip,
                                { borderColor: active ? colors.primary : colors.border },
                                active && { backgroundColor: colors.primary },
                              ]}
                            >
                              <Text
                                style={{
                                  color: active ? colors.onPrimary : colors.text,
                                  fontSize: 12,
                                }}
                              >
                                {copy.candidateRange(days)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <SingleLineTextInput
                        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                        value={incomeKeyword}
                        onChangeText={setIncomeKeyword}
                        placeholder={copy.saleIncomeSearch}
                        placeholderTextColor={colors.textSecondary}
                        returnKeyType="search"
                      />
                      <View style={{ marginTop: 8, gap: 4 }}>
                        {incomeListQuery.isLoading && (
                          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
                            {zh.common.loading}
                          </Text>
                        )}
                        {!incomeListQuery.isLoading && incomeList.length === 0 && (
                          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
                            {copy.noIncomeToLink}
                          </Text>
                        )}
                        {incomeList.map((tx) => {
                          const linked = linkedIncomeIds.has(tx.id);
                          const title = tx.note.trim() || tx.categoryName || copy.soldIncomeLabel;
                          const sub = [tx.dateKey, tx.parentCategoryName, tx.categoryName, tx.accountName]
                            .filter(Boolean)
                            .join(' · ');
                          return (
                            <Pressable
                              key={tx.id}
                              accessibilityRole="button"
                              accessibilityLabel={`${title} ${formatCentsWithSymbol(tx.amount, tx.currency)}`}
                              disabled={linked}
                              onPress={() => confirmLinkSell(tx)}
                              style={({ pressed }) => [
                                styles.incomeRow,
                                { backgroundColor: pressed ? colors.background : colors.card, opacity: linked ? 0.45 : 1 },
                              ]}
                            >
                              <View style={{ flex: 1, gap: 2 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', flexShrink: 1 }} numberOfLines={1}>
                                    {title}
                                  </Text>
                                  {linked && (
                                    <View style={[styles.linkedBadge, { borderColor: colors.border }]}>
                                      <Text style={{ color: colors.textSecondary, fontSize: 10 }}>
                                        {copy.linkedBadge}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                                  {sub}
                                </Text>
                              </View>
                              <Text
                                style={{ color: colors.income, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}
                              >
                                +{formatCentsWithSymbol(tx.amount, tx.currency)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}
                </View>
              )}

              {panel === 'dispose' && (
                <View style={styles.panel} testID="asset-dispose-panel">
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    {copy.disposedAt}
                  </Text>
                  <DatePickerField value={disposeDate} onPick={setDisposeDate} />
                  <ActionButton
                    label={copy.confirmDispose}
                    pending={dispose.isPending}
                    onPress={handleDispose}
                  />
                </View>
              )}
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.reactivate}
              style={[styles.reactivateBtn, { borderColor: colors.primary }]}
              onPress={() =>
                void reactivate
                  .mutateAsync(assetId)
                  .catch((e: unknown) => {
                    showDialog(zh.common.error, e instanceof Error ? e.message : String(e));
                  })
              }
            >
              <Icon name="rotate-ccw" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>
                {copy.reactivate}
              </Text>
            </Pressable>
          )}
        </View>

      </ScrollView>
    </SecondarySheetScreen>
  );
}

/** 生命周期触发按钮：紧凑描边胶囊，激活态填充 */
function LifecycleAction({
  icon,
  label,
  color,
  active,
  onPress,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  color: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.lifecycleBtn,
        { borderColor: active ? color : colors.border, opacity: pressed ? 0.6 : 1 },
        active && { backgroundColor: color },
      ]}
      onPress={onPress}
    >
      <Icon name={icon} size={15} color={active ? colors.onPrimary : color} />
      <Text
        style={{ color: active ? colors.onPrimary : color, fontSize: 13, fontWeight: '600' }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** 供列表页复用的行渲染（保持信息密度一致） */
export function AssetListItem({
  asset,
  onPress,
}: {
  asset: PersonalAsset;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const copy = zh.personalAssets;
  const categoryDef = resolveAssetCategory(asset.category);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={asset.name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.itemCard,
        { backgroundColor: pressed ? colors.background : colors.card },
      ]}
    >
      <IconBubble name={categoryDef.icon} color={categoryDef.color} size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500', flexShrink: 1 }} numberOfLines={1}>
            {asset.name}
          </Text>
          <View
            style={[
              styles.srcBadge,
              {
                borderColor: ASSET_STATUS_COLOR[asset.status],
                backgroundColor: `${ASSET_STATUS_COLOR[asset.status]}18`,
              },
            ]}
          >
            <Text style={{ color: ASSET_STATUS_COLOR[asset.status], fontSize: 10 }}>
              {copy.status[asset.status]}
            </Text>
          </View>
          {asset.installmentPeriods > 0 && (
            <View
              style={[
                styles.srcBadge,
                {
                  borderColor: asset.installmentClosedDateKey ? colors.border : colors.primary,
                },
              ]}
            >
              <Text
                style={{
                  color: asset.installmentClosedDateKey ? colors.textSecondary : colors.primary,
                  fontSize: 10,
                }}
              >
                {copy.installmentBadge}
              </Text>
            </View>
          )}
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
          {categoryDef.label} · {asset.acquiredDateKey} · {asset.quantity} {copy.quantityUnit}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
          {formatCentsWithSymbol(asset.costCents)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 12, padding: 16, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusChip: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  infoList: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
  },
  actionRow: { flexDirection: 'row', gap: 8 },
  installmentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  installmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    rowGap: 10,
  },
  installmentCell: { width: '33.33%', gap: 2 },
  sellModeSegment: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginBottom: 4,
  },
  sellModeItem: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8 },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    marginTop: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accountChip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  incomeRangeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  incomeRangeChip: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  incomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  linkedBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  lifecycleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  panel: { marginTop: 12, gap: 4 },
  fieldLabel: { fontSize: 13, marginTop: 10, marginBottom: 6 },
  input: { height: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 15 },
  reactivateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  srcBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
});
