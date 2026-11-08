import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '@/components/dialog';
import { FormActionBar } from '@/components/form/form-action-bar';
import { Icon } from '@/components/Icon';
import { IconBubble } from '@/components/IconBubble';
import { SecondarySheetScreen } from '@/components/navigation/secondary-sheet-screen';
import { zh } from '@/i18n/zh';
import { resolveIconKey } from '@/lib/iconResolvers';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';
import type { TxListItem } from '@/features/transactions';
import {
  CANDIDATE_DEFAULT_RANGE_DAYS,
  CANDIDATE_RANGE_OPTIONS,
  guessAssetCategory,
  resolveAssetCategory,
  transactionToAssetInput,
  useAssetCandidates,
  useCreateAssetsFromCandidates,
  useIgnoreAssetCandidate,
  type AssetCandidate,
} from '..';

/**
 * 疑似资产消费清单：从近 N 天支出中智能筛选，勾选后批量生成资产；
 * 单条可打开预填编辑器调整，或忽略（持久化后不再提示）。
 */
export function AssetCandidatesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const copy = zh.personalAssets;
  const [rangeDays, setRangeDays] = useState<number>(CANDIDATE_DEFAULT_RANGE_DAYS);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  const candidatesQuery = useAssetCandidates(rangeDays);
  const candidates = useMemo(() => candidatesQuery.data ?? [], [candidatesQuery.data]);
  const createBatch = useCreateAssetsFromCandidates();
  const ignoreCandidate = useIgnoreAssetCandidate();

  const selected = useMemo(
    () => candidates.filter((candidate) => selectedIds.has(candidate.transaction.id)),
    [candidates, selectedIds],
  );
  const selectedTotal = useMemo(
    () => selected.reduce((sum, candidate) => sum + candidate.transaction.amountBaseCents, 0),
    [selected],
  );

  function changeRange(days: number) {
    setRangeDays(days);
    setSelectedIds(new Set());
  }

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openEditor(tx: TxListItem) {
    router.push(`/personal-assets/edit?fromTransactionId=${tx.id}`);
  }

  function promptIgnore(tx: TxListItem) {
    showDialog(
      copy.ignoreCandidate,
      `${tx.dateKey} · ${formatCentsWithSymbol(tx.amount, tx.currency)}`,
      [
        { text: zh.common.cancel, style: 'cancel' },
        {
          text: copy.ignoreCandidate,
          style: 'destructive',
          onPress: () => {
            void ignoreCandidate
              .mutateAsync(tx.id)
              .then(() => {
                setSelectedIds((current) => {
                  const next = new Set(current);
                  next.delete(tx.id);
                  return next;
                });
              })
              .catch((error: unknown) => {
                showDialog(zh.common.error, error instanceof Error ? error.message : String(error));
              });
          },
        },
      ],
    );
  }

  function openCandidateActions(tx: TxListItem, candidate: AssetCandidate) {
    showDialog(
      tx.note.trim() || tx.categoryName || copy.candidatesTitle,
      `${tx.dateKey} · ${formatCentsWithSymbol(tx.amount, tx.currency)} · ${candidate.reasons
        .map((reason) => copy.candidateReason[reason])
        .join(' / ')}`,
      [
        { text: zh.common.cancel, style: 'cancel' },
        { text: copy.editCandidate, onPress: () => openEditor(tx) },
        { text: copy.ignoreCandidate, style: 'destructive', onPress: () => promptIgnore(tx) },
      ],
    );
  }

  function confirmCreate(dismiss: () => void) {
    if (selected.length === 0 || createBatch.isPending) return;
    showDialog(
      copy.confirmCreateTitle,
      copy.confirmCreateMsg(selected.length, formatCentsWithSymbol(selectedTotal)),
      [
        { text: zh.common.cancel, style: 'cancel' },
        {
          text: zh.common.confirm,
          onPress: () => {
            void createBatch
              .mutateAsync(selected.map((candidate) => transactionToAssetInput(candidate.transaction)))
              .then((ids) => {
                showDialog(copy.createdTitle(ids.length), undefined, [
                  { text: zh.common.gotIt, onPress: dismiss },
                ]);
              })
              .catch((error: unknown) => {
                showDialog(zh.common.error, error instanceof Error ? error.message : String(error));
              });
          },
        },
      ],
    );
  }

  return (
    <SecondarySheetScreen title={copy.candidatesTitle}>
      {({ dismiss }) => (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* 时间窗 */}
            <View style={styles.chipRow}>
              {CANDIDATE_RANGE_OPTIONS.map((days) => {
                const active = rangeDays === days;
                return (
                  <Pressable
                    key={days}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={copy.candidateRange(days)}
                    onPress={() => changeRange(days)}
                    style={[
                      styles.rangeChip,
                      { borderColor: active ? colors.primary : colors.border },
                      active && { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text style={{ color: active ? colors.onPrimary : colors.text, fontSize: 13 }}>
                      {copy.candidateRange(days)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              {copy.selectedCount(selected.length)} · {copy.candidateHint(rangeDays)}
            </Text>

            {candidatesQuery.isLoading && (
              <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 24 }}>
                {zh.common.loading}
              </Text>
            )}

            {candidatesQuery.isError && (
              <Text style={{ color: colors.expense, textAlign: 'center', paddingVertical: 24 }}>
                {zh.common.error}
              </Text>
            )}

            {!candidatesQuery.isLoading && !candidatesQuery.isError && candidates.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                <Icon name="sparkles" size={32} color={colors.textSecondary} />
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                  {copy.candidateEmpty}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                  {copy.candidateEmptyHint}
                </Text>
              </View>
            )}

            {candidates.map((candidate) => {
              const tx = candidate.transaction;
              const checked = selectedIds.has(tx.id);
              const title = tx.note.trim() || tx.categoryName || copy.candidatesTitle;
              const sub = [tx.dateKey, tx.parentCategoryName, tx.categoryName, tx.accountName]
                .filter(Boolean)
                .join(' · ');
              const assetCategory = resolveAssetCategory(guessAssetCategory(tx));
              return (
                <View key={tx.id} style={[styles.row, { backgroundColor: colors.card }]}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={title}
                    onPress={() => toggle(tx.id)}
                    style={styles.rowMain}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        { borderColor: checked ? colors.primary : colors.border },
                        checked && { backgroundColor: colors.primary },
                      ]}
                    >
                      {checked && <Icon name="check" size={14} color={colors.onPrimary} />}
                    </View>
                    <IconBubble
                      name={resolveIconKey(tx.categoryIcon, 'category')}
                      color={tx.categoryColor ?? colors.primary}
                      size={36}
                    />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
                        {title}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                        {sub}
                      </Text>
                      <View style={styles.reasons}>
                        {candidate.reasons.map((reason) => (
                          <View
                            key={reason}
                            style={[
                              styles.reasonPill,
                              { backgroundColor: `${reasonColor(reason, colors)}22` },
                            ]}
                          >
                            <Text style={{ color: reasonColor(reason, colors), fontSize: 10 }}>
                              {copy.candidateReason[reason]}
                            </Text>
                          </View>
                        ))}
                        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>
                          {assetCategory.label}
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text style={{ color: colors.expense, fontSize: 15, fontWeight: '600' }}>
                        -{formatCentsWithSymbol(tx.amount, tx.currency)}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 10 }}>
                        {tx.currency !== 'CNY' ? formatCentsWithSymbol(tx.amountBaseCents) : ' '}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${title} ${copy.editCandidate}`}
                    hitSlop={8}
                    onPress={() => openCandidateActions(tx, candidate)}
                    style={({ pressed }) => [styles.moreButton, { opacity: pressed ? 0.5 : 1 }]}
                  >
                    <Icon name="more-horizontal" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

          <FormActionBar
            label={copy.createSelected(selected.length)}
            icon="check"
            disabled={selected.length === 0}
            pending={createBatch.isPending}
            keyboardAware={false}
            hint={
              selected.length > 0
                ? `${copy.candidateTotal(formatCentsWithSymbol(selectedTotal))} · ${copy.selectedCount(selected.length)}`
                : undefined
            }
            onPress={() => confirmCreate(dismiss)}
          />
        </View>
      )}
    </SecondarySheetScreen>
  );
}

function reasonColor(
  reason: AssetCandidate['reasons'][number],
  colors: { primary: string; transfer: string; income: string },
): string {
  if (reason === 'large') return colors.primary;
  if (reason === 'category') return colors.transfer;
  return colors.income;
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  rangeChip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  hint: { fontSize: 12, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 8,
    paddingLeft: 12,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasons: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  reasonPill: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  moreButton: {
    width: 36,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
