import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { Icon } from '@/components/Icon';
import { IconBubble } from '@/components/IconBubble';
import { SecondarySheetScreen } from '@/components/navigation/secondary-sheet-screen';
import { SingleLineTextInput } from '@/components/single-line-text-input';
import {
  useBudgets,
  useBudgetStatus,
  useRemoveBudget,
  useUpsertBudget,
  type BudgetStatusItem,
} from '@/features/budgets';
import { useCategoryTree } from '@/features/categories';
import { zh } from '@/i18n/zh';
import { dayjs, toMonthKey, todayKey } from '@/lib/date';
import { resolveIconKey } from '@/lib/iconResolvers';
import { formatCents, parseMoneyToCents } from '@/lib/money';
import { motion, useTheme, type AppTheme } from '@/theme';

const ALERT_PCT_OPTIONS = [50, 80, 90, 100];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** 编辑器状态：null=关闭；categoryId undefined 表示新增（待选分类），null 表示总预算 */
type EditorState = {
  budgetId: string | null;
  categoryId: string | null | undefined;
  amountText: string;
  alertPct: number;
};

export default function BudgetsScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [monthKey, setMonthKey] = useState(() => toMonthKey(todayKey()));
  const [editor, setEditor] = useState<EditorState | null>(null);

  const { data: status } = useBudgetStatus(monthKey);
  const { data: budgets = [] } = useBudgets();
  const { data: expenseTree = [] } = useCategoryTree('expense');
  const upsert = useUpsertBudget();
  const remove = useRemoveBudget();

  const isCurrentMonth = monthKey === toMonthKey(todayKey());
  const total = status?.total ?? null;
  const categoryItems = status?.categories ?? [];

  // 一级支出分类中尚未设置预算的（新增时可选）
  const budgetedCategoryIds = new Set(
    budgets.filter((b) => b.categoryId !== null).map((b) => b.categoryId),
  );
  const selectableCategories = expenseTree.filter((c) => !budgetedCategoryIds.has(c.id));

  function shiftMonth(delta: number) {
    setMonthKey(dayjs(`${monthKey}-01`).add(delta, 'month').format('YYYY-MM'));
  }

  function levelColor(level: BudgetStatusItem['level']): string {
    if (level === 'over') return colors.expense;
    if (level === 'warn') return colors.warning;
    return colors.primary;
  }

  function openEditor(item: BudgetStatusItem | null, forTotal = false) {
    if (item) {
      setEditor({
        budgetId: item.budgetId,
        categoryId: item.categoryId,
        amountText: formatCents(item.amount, { grouping: false }),
        alertPct: item.alertPct,
      });
    } else {
      setEditor({
        budgetId: null,
        categoryId: forTotal ? null : undefined,
        amountText: '',
        alertPct: 80,
      });
    }
  }

  function handleSave() {
    if (!editor) return;
    if (editor.categoryId === undefined) {
      Alert.alert(zh.budgets.needCategory);
      return;
    }
    const amount = parseMoneyToCents(editor.amountText);
    if (amount === null || amount <= 0) {
      Alert.alert(zh.budgets.invalidAmount);
      return;
    }
    upsert.mutate(
      { categoryId: editor.categoryId, amount, alertPct: editor.alertPct },
      {
        onSuccess: () => setEditor(null),
        onError: (e) => Alert.alert(zh.common.error, e instanceof Error ? e.message : String(e)),
      },
    );
  }

  function handleDelete() {
    if (!editor?.budgetId) return;
    const id = editor.budgetId;
    Alert.alert(zh.common.delete, zh.budgets.deleteConfirm, [
      { text: zh.common.cancel, style: 'cancel' },
      {
        text: zh.common.delete,
        style: 'destructive',
        onPress: () => remove.mutate(id, { onSuccess: () => setEditor(null) }),
      },
    ]);
  }

  function renderBar(pct: number, color: string, height = 8) {
    return (
      <View style={[styles.barTrack, { height, borderRadius: height / 2 }]}>
        <View
          style={{
            width: `${Math.min(pct, 100)}%`,
            height,
            borderRadius: height / 2,
            backgroundColor: color,
          }}
        />
      </View>
    );
  }

  const hasAnyBudget = total !== null || categoryItems.length > 0;
  const editingName =
    editor?.categoryId === null
      ? zh.budgets.totalOption
      : (expenseTree.find((c) => c.id === editor?.categoryId)?.name ?? '');

  return (
    <SecondarySheetScreen title={zh.budgets.title}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* 月份切换 */}
      <View style={styles.monthBar}>
        <Pressable style={styles.monthArrow} onPress={() => shiftMonth(-1)}>
          <Icon name="chevron-left" size={20} color={colors.primary} />
        </Pressable>
        <Text style={styles.monthTitle}>{dayjs(`${monthKey}-01`).format('YYYY年MM月')}</Text>
        <Pressable style={styles.monthArrow} onPress={() => shiftMonth(1)}>
          <Icon name="chevron-right" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      >
        {/* 总预算卡片 */}
        {total ? (
          <Pressable
            style={[styles.card, { backgroundColor: colors.card }]}
            onPress={() => openEditor(total)}
          >
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{zh.budgets.totalBudget}</Text>
              <Text style={[styles.levelBadge, { color: levelColor(total.level) }]}>
                {total.level === 'over'
                  ? zh.budgets.overspent
                  : total.level === 'warn'
                    ? zh.budgets.nearLimit
                    : `${total.pct}%`}
              </Text>
            </View>
            <Text style={[styles.totalRemaining, { color: levelColor(total.level) }]}>
              {formatCents(total.remaining)}
            </Text>
            <Text style={styles.subText}>{zh.budgets.remaining}</Text>
            <View style={{ marginTop: 12 }}>{renderBar(total.pct, levelColor(total.level), 12)}</View>
            <View style={[styles.rowBetween, { marginTop: 8 }]}>
              <Text style={styles.subText}>
                {zh.budgets.spent} {formatCents(total.spent)} / {formatCents(total.amount)}
              </Text>
              {isCurrentMonth && (
                <Text style={styles.subText}>
                  {zh.budgets.dailyAvailable} {formatCents(total.daily)}
                </Text>
              )}
            </View>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.card, styles.setTotalBtn, { borderColor: colors.border }]}
            onPress={() => openEditor(null, true)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="plus" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>
                {zh.budgets.setTotal}
              </Text>
            </View>
          </Pressable>
        )}

        {/* 分类预算 */}
        <View style={[styles.rowBetween, { marginTop: 8, marginBottom: 8 }]}>
          <Text style={styles.sectionTitle}>{zh.budgets.categorySection}</Text>
          <Pressable onPress={() => openEditor(null)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="plus" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 14 }}>{zh.budgets.add}</Text>
            </View>
          </Pressable>
        </View>

        {categoryItems.map((item) => (
          <Pressable
            key={item.budgetId}
            style={[styles.card, { backgroundColor: colors.card, paddingVertical: 12 }]}
            onPress={() => openEditor(item)}
          >
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconBubble
                  name={resolveIconKey(item.icon, 'category')}
                  color={item.color ?? colors.primary}
                  size={36}
                />
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>
                  {item.name}
                </Text>
              </View>
              <Text style={[styles.levelBadge, { color: levelColor(item.level) }]}>
                {item.level === 'over'
                  ? zh.budgets.overspent
                  : item.level === 'warn'
                    ? zh.budgets.nearLimit
                    : `${item.pct}%`}
              </Text>
            </View>
            <View style={{ marginTop: 10 }}>{renderBar(item.pct, levelColor(item.level))}</View>
            <View style={[styles.rowBetween, { marginTop: 6 }]}>
              <Text style={styles.subText}>
                {zh.budgets.spent} {formatCents(item.spent)} / {formatCents(item.amount)}
              </Text>
              <Text
                style={[
                  styles.subText,
                  item.remaining < 0 && { color: colors.expense },
                ]}
              >
                {zh.budgets.remaining} {formatCents(item.remaining)}
              </Text>
            </View>
          </Pressable>
        ))}

        {!hasAnyBudget && (
          <View style={styles.empty}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
              {zh.budgets.empty}
            </Text>
            <Text style={[styles.subText, { marginTop: 8, textAlign: 'center' }]}>
              {zh.budgets.emptyHint}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* 新增/编辑弹层 */}
      <Modal
        visible={editor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditor(null)}
      >
        <Pressable style={styles.modalMask} onPress={() => setEditor(null)}>
          {/* 遮罩 fade + 面板上滑分离（业界底部弹层规范） */}
          <AnimatedPressable
            entering={SlideInDown.duration(motion.enter)}
            style={[styles.modalCard, { backgroundColor: colors.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.cardTitle, { marginBottom: 12 }]}>
              {editor?.budgetId ? zh.budgets.editBudget : zh.budgets.addBudget}
            </Text>

            {/* 分类：编辑时固定展示；新增时选一级支出分类 */}
            <Text style={styles.fieldLabel}>{zh.budgets.category}</Text>
            {editor?.budgetId ? (
              <Text style={{ color: colors.text, fontSize: 15, marginBottom: 4 }}>
                {editor.categoryId === null ? zh.budgets.totalOption : editingName}
              </Text>
            ) : editor?.categoryId === null ? (
              <Text style={{ color: colors.text, fontSize: 15, marginBottom: 4 }}>
                {zh.budgets.totalOption}
              </Text>
            ) : (
              <View style={styles.chipWrap}>
                {selectableCategories.length === 0 && (
                  <Text style={styles.subText}>{zh.budgets.noSelectableCategory}</Text>
                )}
                {selectableCategories.map((c) => {
                  const selected = editor?.categoryId === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      style={[
                        styles.chip,
                        { borderColor: colors.border },
                        selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                      onPress={() =>
                        setEditor((prev) => (prev ? { ...prev, categoryId: c.id } : prev))
                      }
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Icon
                          name={resolveIconKey(c.icon, 'category')}
                          size={14}
                          color={selected ? colors.onPrimary : colors.text}
                        />
                        <Text style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 13 }}>
                          {c.name}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text style={styles.fieldLabel}>{zh.budgets.amount}</Text>
            <SingleLineTextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              value={editor?.amountText ?? ''}
              onChangeText={(t) => setEditor((prev) => (prev ? { ...prev, amountText: t } : prev))}
              keyboardType="decimal-pad"
              placeholder={zh.budgets.amountPlaceholder}
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={styles.fieldLabel}>{zh.budgets.alertPct}</Text>
            <View style={styles.chipWrap}>
              {ALERT_PCT_OPTIONS.map((pct) => {
                const selected = editor?.alertPct === pct;
                return (
                  <Pressable
                    key={pct}
                    style={[
                      styles.chip,
                      { borderColor: colors.border },
                      selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => setEditor((prev) => (prev ? { ...prev, alertPct: pct } : prev))}
                  >
                    <Text style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 13 }}>
                      {pct}%
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.subText, { marginTop: 4 }]}>{zh.budgets.alertPctHint}</Text>

            <Pressable
              style={[
                styles.saveBtn,
                { backgroundColor: colors.primary, opacity: upsert.isPending ? 0.6 : 1 },
              ]}
              onPress={handleSave}
              disabled={upsert.isPending}
            >
              <Text style={styles.saveBtnText}>{zh.common.save}</Text>
            </Pressable>
            {editor?.budgetId && (
              <Pressable style={styles.deleteBtn} onPress={handleDelete}>
                <Text style={{ color: colors.expense, fontSize: 15 }}>{zh.common.delete}</Text>
              </Pressable>
            )}
          </AnimatedPressable>
        </Pressable>
      </Modal>
      </View>
    </SecondarySheetScreen>
  );
}

function makeStyles({ colors }: AppTheme) {
  return StyleSheet.create({
    monthBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    monthArrow: { paddingHorizontal: 24, paddingVertical: 4 },
    monthArrowText: { color: colors.primary, fontSize: 18 },
    monthTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
    card: { borderRadius: 12, padding: 16, marginBottom: 10 },
    cardTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
    sectionTitle: { color: colors.textSecondary, fontSize: 13 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    totalRemaining: { fontSize: 32, fontWeight: '700', marginTop: 10 },
    subText: { color: colors.textSecondary, fontSize: 12 },
    levelBadge: { fontSize: 13, fontWeight: '600' },
    barTrack: { backgroundColor: colors.border, overflow: 'hidden', width: '100%' },
    setTotalBtn: {
      alignItems: 'center',
      borderWidth: 1,
      borderStyle: 'dashed',
      backgroundColor: 'transparent',
      paddingVertical: 20,
    },
    empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
    modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalCard: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 20,
      paddingBottom: 32,
    },
    fieldLabel: { color: colors.textSecondary, fontSize: 13, marginTop: 14, marginBottom: 8 },
    input: {
      height: 40,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      fontSize: 15,
    },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
    saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    saveBtnText: { color: colors.onPrimary, fontSize: 16, fontWeight: '600' },
    deleteBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  });
}
