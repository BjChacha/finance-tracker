import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Icon } from '@/components/Icon';
import { SecondarySheetScreen } from '@/components/navigation/secondary-sheet-screen';
import { showDialog } from '@/components/dialog';
import { SingleLineTextInput } from '@/components/single-line-text-input';
import { useCategoryTree } from '@/features/categories';
import {
  hitRate,
  rulesText,
  useCategoryStats,
  useRemoveRule,
  useRules,
  useSetRuleEnabled,
  useUpsertRule,
  type RuleListItem,
} from '@/features/rules';
import { CategoryPickerModal } from '@/features/transactions/components/CategoryPickerModal';
import { zh } from '@/i18n/zh';
import { parseMoneyToCents } from '@/lib/money';
import { useTheme, type AppTheme } from '@/theme';
import type { TransactionType } from '@/db/schema';

type EditorState = {
  id: string | null;
  keyword: string;
  matchType: TransactionType | null;
  amountMinText: string;
  amountMaxText: string;
  categoryId: string | null;
  categoryName: string;
};

const EMPTY_EDITOR: EditorState = {
  id: null,
  keyword: '',
  matchType: null,
  amountMinText: '',
  amountMaxText: '',
  categoryId: null,
  categoryName: '',
};

const TYPE_OPTIONS: { value: TransactionType | null; label: string }[] = [
  { value: null, label: rulesText.anyType },
  { value: 'expense', label: zh.tx.expense },
  { value: 'income', label: zh.tx.income },
  { value: 'transfer', label: zh.tx.transfer },
];

function makeStyles(theme: AppTheme) {
  const { colors } = theme;
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      paddingHorizontal: 16,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
    },
    rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    keyword: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
    meta: { color: colors.textSecondary, fontSize: 12 },
    toggle: { padding: 6 },
    sectionTitle: {
      color: colors.textSecondary,
      fontSize: 12,
      marginBottom: 6,
    },
    empty: {
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: 40,
      lineHeight: 22,
    },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: colors.primary,
      marginTop: 12,
    },
    addBtnText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
    statsCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 16,
      gap: 8,
      marginTop: 16,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    statsLabel: { color: colors.text, fontSize: 14 },
    statsValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
    editorField: { gap: 6, marginBottom: 14 },
    editorLabel: { color: colors.textSecondary, fontSize: 12 },
    input: {
      color: colors.text,
      fontSize: 15,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segRow: { flexDirection: 'row', gap: 8 },
    seg: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    segText: { color: colors.text, fontSize: 13 },
    segTextActive: { color: colors.onPrimary, fontSize: 13, fontWeight: '600' },
    pickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pickBtnText: { color: colors.text, fontSize: 15, flex: 1 },
    editorActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    primaryBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    primaryBtnText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
    dangerBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
      paddingHorizontal: 18,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.expense,
    },
    dangerBtnText: { color: colors.expense, fontSize: 15, fontWeight: '600' },
  });
}

export default function RulesScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const rules = useRules();
  const stats = useCategoryStats();
  const upsert = useUpsertRule();
  const remove = useRemoveRule();
  const setEnabled = useSetRuleEnabled();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerTree = useCategoryTree(editor?.matchType ?? 'expense');

  function openCreate() {
    setEditor({ ...EMPTY_EDITOR });
  }

  function openEdit(rule: RuleListItem) {
    setEditor({
      id: rule.id,
      keyword: rule.keyword,
      matchType: rule.matchType,
      amountMinText:
        rule.amountMin !== null ? (rule.amountMin / 100).toString() : '',
      amountMaxText:
        rule.amountMax !== null ? (rule.amountMax / 100).toString() : '',
      categoryId: rule.categoryId,
      categoryName: rule.categoryName,
    });
  }

  function saveEditor() {
    if (!editor) return;
    const amountMin = editor.amountMinText.trim()
      ? parseMoneyToCents(editor.amountMinText.trim())
      : null;
    const amountMax = editor.amountMaxText.trim()
      ? parseMoneyToCents(editor.amountMaxText.trim())
      : null;
    if (
      (editor.amountMinText.trim() && amountMin === null) ||
      (editor.amountMaxText.trim() && amountMax === null)
    ) {
      showDialog(zh.common.error, '金额区间格式不正确');
      return;
    }
    upsert.mutate(
      {
        id: editor.id ?? undefined,
        name: `${editor.keyword.trim()}→${editor.categoryName}`,
        keyword: editor.keyword,
        matchType: editor.matchType,
        amountMin,
        amountMax,
        categoryId: editor.categoryId ?? '',
      },
      {
        onSuccess: () => setEditor(null),
        onError: (error) =>
          showDialog(zh.common.error, error instanceof Error ? error.message : String(error)),
      },
    );
  }

  function confirmDelete(id: string) {
    showDialog(rulesText.delete, rulesText.deleteConfirm, [
      { text: zh.common.cancel, style: 'cancel' },
      {
        text: zh.common.confirm,
        style: 'destructive',
        onPress: () => remove.mutate(id),
      },
    ]);
  }

  const suggestionRate = stats.data ? hitRate(stats.data, 'suggestion') : null;
  const nlRate = stats.data ? hitRate(stats.data, 'nl') : null;

  return (
    <SecondarySheetScreen title={rulesText.title}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >
        <Text style={styles.sectionTitle}>{rulesText.hint}</Text>
        <View style={styles.card}>
          {rules.data?.length === 0 && (
            <Text style={styles.empty}>{rulesText.empty}</Text>
          )}
          {rules.data?.map((rule, i) => (
            <View key={rule.id}>
              {i > 0 && <View style={styles.rowDivider} />}
              <Pressable
                style={styles.row}
                onPress={() => openEdit(rule)}
                accessibilityRole="button"
                accessibilityLabel={`${rule.keyword} ${rule.categoryName}`}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.keyword} numberOfLines={1}>
                    {rule.keyword}
                    <Text style={{ color: colors.textSecondary, fontWeight: '400' }}>
                      {' → '}
                      {rule.categoryName}
                    </Text>
                  </Text>
                  <Text style={styles.meta}>
                    {rule.matchType !== null
                      ? `仅${TYPE_OPTIONS.find((o) => o.value === rule.matchType)?.label ?? ''} · `
                      : ''}
                    {rule.matchCount > 0
                      ? rulesText.matchCount(rule.matchCount)
                      : rulesText.neverMatched}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={rule.enabled ? '停用规则' : '启用规则'}
                  style={styles.toggle}
                  onPress={() =>
                    setEnabled.mutate({ id: rule.id, enabled: rule.enabled !== 1 })
                  }
                >
                  {rule.enabled === 1 ? (
                    <Icon name="circle-check-big" size={22} color={colors.income} />
                  ) : (
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                      已停用
                    </Text>
                  )}
                </Pressable>
              </Pressable>
            </View>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          style={styles.addBtn}
          onPress={openCreate}
        >
          <Icon name="plus" size={18} color={colors.onPrimary} />
          <Text style={styles.addBtnText}>{rulesText.add}</Text>
        </Pressable>

        <View style={styles.statsCard}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
            {rulesText.statsTitle}
          </Text>
          {suggestionRate === null && nlRate === null ? (
            <Text style={styles.empty}>{rulesText.noStats}</Text>
          ) : (
            <>
              {suggestionRate !== null && (
                <View style={styles.statsRow}>
                  <Text style={styles.statsLabel}>
                    {rulesText.suggestionRate('')}
                  </Text>
                  <Text style={styles.statsValue}>
                    {Math.round(suggestionRate * 100)}%
                  </Text>
                </View>
              )}
              {nlRate !== null && (
                <View style={styles.statsRow}>
                  <Text style={styles.statsLabel}>{rulesText.nlRate('')}</Text>
                  <Text style={styles.statsValue}>
                    {Math.round(nlRate * 100)}%
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={editor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditor(null)}
      >
        <Pressable
          style={stylesOverlay(colors).mask}
          onPress={() => setEditor(null)}
        >
          <Pressable
            style={stylesOverlay(colors).sheet}
            onPress={(e) => e.stopPropagation()}
          >
            {editor && (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 16 }}>
                  {editor.id ? rulesText.edit : rulesText.add}
                </Text>
                <View style={styles.editorField}>
                  <Text style={styles.editorLabel}>{rulesText.keywordLabel}</Text>
                  <SingleLineTextInput
                    style={styles.input}
                    value={editor.keyword}
                    onChangeText={(keyword) => setEditor({ ...editor, keyword })}
                    placeholder={rulesText.keywordPlaceholder}
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={styles.editorField}>
                  <Text style={styles.editorLabel}>{rulesText.matchTypeLabel}</Text>
                  <View style={styles.segRow}>
                    {TYPE_OPTIONS.map((option) => {
                      const active = editor.matchType === option.value;
                      return (
                        <Pressable
                          key={option.label}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={[styles.seg, active && styles.segActive]}
                          onPress={() =>
                            setEditor({ ...editor, matchType: option.value })
                          }
                        >
                          <Text style={active ? styles.segTextActive : styles.segText}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View style={styles.editorField}>
                  <Text style={styles.editorLabel}>{rulesText.amountRangeLabel}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <SingleLineTextInput
                      style={[styles.input, { flex: 1 }]}
                      value={editor.amountMinText}
                      onChangeText={(amountMinText) =>
                        setEditor({ ...editor, amountMinText })
                      }
                      placeholder="0"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="decimal-pad"
                    />
                    <View style={{ justifyContent: 'center' }}>
                      <Text style={{ color: colors.textSecondary }}>—</Text>
                    </View>
                    <SingleLineTextInput
                      style={[styles.input, { flex: 1 }]}
                      value={editor.amountMaxText}
                      onChangeText={(amountMaxText) =>
                        setEditor({ ...editor, amountMaxText })
                      }
                      placeholder="∞"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <View style={styles.editorField}>
                  <Text style={styles.editorLabel}>{rulesText.categoryLabel}</Text>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.pickBtn}
                    onPress={() => setPickerOpen(true)}
                  >
                    <Icon name="tag" size={16} color={colors.primary} />
                    <Text style={styles.pickBtnText}>
                      {editor.categoryId
                        ? editor.categoryName
                        : rulesText.pickCategory}
                    </Text>
                    <Icon name="chevron-right" size={16} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <View style={styles.editorActions}>
                  {editor.id && (
                    <Pressable
                      accessibilityRole="button"
                      style={styles.dangerBtn}
                      onPress={() => {
                        const id = editor.id;
                        setEditor(null);
                        if (id) confirmDelete(id);
                      }}
                    >
                      <Text style={styles.dangerBtnText}>{rulesText.delete}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    style={styles.primaryBtn}
                    disabled={upsert.isPending}
                    onPress={saveEditor}
                  >
                    <Text style={styles.primaryBtnText}>{rulesText.save}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
        <CategoryPickerModal
          visible={pickerOpen && editor !== null}
          tree={pickerTree.data ?? []}
          categoryType={editor?.matchType ?? 'expense'}
          selectedId={editor?.categoryId ?? null}
          onSelect={(id) => {
            if (editor) {
              const node = (pickerTree.data ?? [])
                .flatMap((parent) => [parent, ...parent.children])
                .find((item) => item.id === id);
              setEditor({
                ...editor,
                categoryId: id,
                categoryName: node?.name ?? '',
              });
            }
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      </Modal>
    </SecondarySheetScreen>
  );
}

function stylesOverlay(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    mask: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 24,
    },
    sheet: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 18,
      maxHeight: 520,
    },
  });
}
