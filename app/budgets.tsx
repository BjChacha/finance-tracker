import { useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { parsePeriodParams } from '@/lib/analytics-range';
import { useTodayKey } from '@/lib/use-today-key';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { showDialog } from '@/components/dialog';
import Animated, {
  Easing,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { ActionButton } from '@/components/form/action-button';
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
import {
  BUDGET_PERIODS,
  currentPeriodKey,
  formatPeriodTitle,
  shiftPeriodKey,
  type BudgetPeriod,
} from '@/lib/date';
import { resolveIconKey } from '@/lib/iconResolvers';
import { formatCents, parseMoneyToCents } from '@/lib/money';
import { motion, useTheme, type AppTheme } from '@/theme';

const ALERT_PCT_OPTIONS = [50, 80, 90, 100];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** 编辑器状态：null=关闭；categoryId undefined 表示新增（待选分类），null 表示总预算 */
type EditorState = {
  budgetId: string | null;
  period: BudgetPeriod;
  categoryId: string | null | undefined;
  amountText: string;
  alertPct: number;
};

export default function BudgetsScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  const params = useLocalSearchParams<{ period?: string; key?: string }>();
  const today = useTodayKey();
  const [initialSelection] = useState(() => parsePeriodParams(params, today));
  const [period, setPeriod] = useState<BudgetPeriod>(initialSelection.period);
  const [periodKey, setPeriodKey] = useState(initialSelection.key);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const { data: status } = useBudgetStatus(period, periodKey);
  const { data: budgets = [] } = useBudgets(period);
  const { data: expenseTree = [] } = useCategoryTree('expense');
  const upsert = useUpsertBudget();
  const remove = useRemoveBudget();

  const scope = zh.budgets.periodScope[period];
  const isCurrentPeriod = periodKey === currentPeriodKey(period);
  const total = status?.total ?? null;
  const categoryItems = status?.categories ?? [];
  const allocation = status?.allocation ?? null;

  // 一级支出分类中尚未设置预算的（新增分类预算时可选）
  const budgetedCategoryIds = new Set(
    budgets.filter((b) => b.categoryId !== null).map((b) => b.categoryId),
  );
  const selectableCategories = expenseTree.filter((c) => !budgetedCategoryIds.has(c.id));

  function selectPeriod(p: BudgetPeriod) {
    setPeriod(p);
    setPeriodKey(currentPeriodKey(p));
  }

  function shiftKey(delta: number) {
    setPeriodKey((k) => shiftPeriodKey(period, k, delta));
  }

  function levelColor(level: BudgetStatusItem['level']): string {
    if (level === 'over') return colors.expense;
    if (level === 'warn') return colors.warning;
    return colors.primary;
  }

  // 分类胶囊选中色与「编辑交易」表单一致：预算是支出分类，用 expense 红
  const typeColor = colors.expense;

  function openEditor(item: BudgetStatusItem | null, forTotal = false) {
    if (item) {
      setEditor({
        budgetId: item.budgetId,
        period: item.period,
        categoryId: item.categoryId,
        amountText: formatCents(item.amount, { grouping: false }),
        alertPct: item.alertPct,
      });
    } else {
      setEditor({
        budgetId: null,
        period,
        categoryId: forTotal ? null : undefined,
        amountText: '',
        alertPct: 80,
      });
    }
  }

  function handleSave() {
    if (!editor) return;
    if (editor.categoryId === undefined) {
      showDialog(zh.budgets.needCategory);
      return;
    }
    const amount = parseMoneyToCents(editor.amountText);
    if (amount === null || amount <= 0) {
      showDialog(zh.budgets.invalidAmount);
      return;
    }
    upsert.mutate(
      { period: editor.period, categoryId: editor.categoryId, amount, alertPct: editor.alertPct },
      {
        onSuccess: () => setEditor(null),
        onError: (e) => showDialog(zh.common.error, e instanceof Error ? e.message : String(e)),
      },
    );
  }

  function handleDelete() {
    if (!editor?.budgetId) return;
    const id = editor.budgetId;
    showDialog(zh.common.delete, zh.budgets.deleteConfirm, [
      { text: zh.common.cancel, style: 'cancel' },
      {
        text: zh.common.delete,
        style: 'destructive',
        onPress: () =>
          remove.mutate(id, {
            onSuccess: () => setEditor(null),
            onError: (e) =>
              showDialog(zh.common.error, e instanceof Error ? e.message : String(e)),
          }),
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
  const editingScope = editor ? zh.budgets.periodScope[editor.period] : '';
  const editingCategory =
    editor?.categoryId != null
      ? (expenseTree.find((c) => c.id === editor.categoryId) ?? null)
      : null;
  const editingName =
    editor?.categoryId === null
      ? zh.budgets.totalOption
      : (editingCategory?.name ?? '');

  // 弹层面板上滑入场。不用 SlideInDown：RN Modal（Dialog window）内 reanimated 的
  // 窗口高度测量与实际不一致，动画终值会残留偏移（卡片悬空，见 CategoryPickerModal
  // 同类注释）。改为把 React 侧 useWindowDimensions 的常量捕获进 worklet 作起点，
  // 终值固定 0，全程不依赖 worklet 侧测量。
  const editorSheetEntering: EntryExitAnimationFunction = () => {
    'worklet';
    return {
      initialValues: {
        transform: [{ translateY: screenH }],
      },
      animations: {
        transform: [
          {
            translateY: withTiming(0, {
              duration: motion.enter,
              easing: Easing.out(Easing.cubic),
            }),
          },
        ],
      },
    };
  };

  return (
    <SecondarySheetScreen title={zh.budgets.title}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* 周期切换：月 / 季 / 年 */}
        <View style={styles.segmentWrap}>
          {BUDGET_PERIODS.map((p) => {
            const active = p === period;
            return (
              <Pressable
                key={p}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => selectPeriod(p)}
              >
                <Text style={{ color: active ? colors.onPrimary : colors.textSecondary, fontSize: 14, fontWeight: '600' }}>
                  {zh.budgets.periods[p]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* periodKey 切换 */}
        <View style={styles.monthBar}>
          <Pressable style={styles.monthArrow} onPress={() => shiftKey(-1)}>
            <Icon name="chevron-left" size={20} color={colors.primary} />
          </Pressable>
          <Text style={styles.monthTitle}>{formatPeriodTitle(period, periodKey)}</Text>
          <Pressable style={styles.monthArrow} onPress={() => shiftKey(1)}>
            <Icon name="chevron-right" size={20} color={colors.primary} />
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          {/* 总预算卡片 */}
          {total ? (
            <Pressable style={[styles.card, { backgroundColor: colors.card }]} onPress={() => openEditor(total)}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{scope}{zh.budgets.totalBudget}</Text>
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
                {isCurrentPeriod && (
                  <Text style={styles.subText}>
                    {zh.budgets.dailyAvailable} {formatCents(total.daily)}
                  </Text>
                )}
              </View>
              {/* 信封分配：已分配 / 待分配 */}
              {allocation && (
                <View style={[styles.rowBetween, { marginTop: 8 }]}>
                  <Text style={styles.subText}>
                    {zh.budgets.allocated} {formatCents(allocation.allocated)} / {formatCents(allocation.totalAmount)}
                  </Text>
                  <Text style={[styles.subText, allocation.toAllocate < 0 && { color: colors.expense }]}>
                    {zh.budgets.toAllocate} {formatCents(allocation.toAllocate)}
                  </Text>
                </View>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[styles.card, styles.setTotalBtn, { borderColor: colors.border }]}
              onPress={() => openEditor(null, true)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="plus" size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>
                  {zh.budgets.setTotal(scope)}
                </Text>
              </View>
            </Pressable>
          )}

          {/* 分类预算 */}
          <View style={[styles.rowBetween, { marginTop: 8, marginBottom: 8 }]}>
            <Text style={styles.sectionTitle}>{zh.budgets.categorySection}</Text>
            {total && (
              <Pressable
                onPress={() => openEditor(null)}
                disabled={selectableCategories.length === 0}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: selectableCategories.length === 0 ? 0.4 : 1 }}>
                  <Icon name="plus" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 14 }}>{zh.budgets.add}</Text>
                </View>
              </Pressable>
            )}
          </View>

          {categoryItems.map((item) => (
            <Pressable
              key={item.budgetId}
              style={[styles.card, { backgroundColor: colors.card, paddingVertical: 12 }]}
              onPress={() => openEditor(item)}
            >
              <View style={styles.rowBetween}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <IconBubble name={resolveIconKey(item.icon, 'category')} color={item.color ?? colors.primary} size={36} />
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{item.name}</Text>
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
                <Text style={[styles.subText, item.remaining < 0 && { color: colors.expense }]}>
                  {zh.budgets.remaining} {formatCents(item.remaining)}
                </Text>
              </View>
            </Pressable>
          ))}

          {!hasAnyBudget && (
            <View style={styles.empty}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{zh.budgets.empty}</Text>
              <Text style={[styles.subText, { marginTop: 8, textAlign: 'center' }]}>
                {zh.budgets.emptyHint(scope)}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* 新增/编辑弹层：遮罩 fade + 完整卡片从底部上滑，贴底不留间隙 */}
        <Modal visible={editor !== null} transparent animationType="fade" onRequestClose={() => setEditor(null)}>
          <Pressable style={styles.modalMask} onPress={() => setEditor(null)}>
            <AnimatedPressable
              entering={editorSheetEntering}
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.card,
                  maxHeight: Math.round(screenH * 0.82),
                  // Modal 内 SafeArea 的 insets.bottom 可能残留键盘高度等异常大值，
                  // clamp 到手势条范围内，避免卡片被撑高、顶部超出屏幕。
                  paddingBottom: Math.min(insets.bottom, 48) + 12,
                },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.editorHeader}>
                <Text style={styles.cardTitle}>
                  {editor?.budgetId ? zh.budgets.editBudget : zh.budgets.addBudget} · {editingScope}
                </Text>
                <Pressable accessibilityLabel={zh.common.close} hitSlop={8} onPress={() => setEditor(null)}>
                  <Icon name="chevron-down" size={22} color={colors.textSecondary} />
                </Pressable>
              </View>

              <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
                {/* 分类：编辑时固定展示；新增时选一级支出分类。胶囊样式与「编辑交易」一致 */}
                <Text style={styles.fieldLabel}>{zh.budgets.category}</Text>
                {editor && (editor.budgetId || editor.categoryId === null) ? (
                  <View style={[styles.chip, { backgroundColor: typeColor, borderColor: typeColor }]}>
                    <Icon
                      name={
                        editor.categoryId === null
                          ? 'target'
                          : resolveIconKey(editingCategory?.icon, 'category')
                      }
                      size={14}
                      color={colors.onPrimary}
                    />
                    <Text style={{ color: colors.onPrimary, fontSize: 13 }}>
                      {editor.categoryId === null ? zh.budgets.totalOption : editingName}
                    </Text>
                  </View>
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
                            { borderColor: selected ? typeColor : colors.border },
                            selected && { backgroundColor: typeColor },
                          ]}
                          onPress={() => setEditor((prev) => (prev ? { ...prev, categoryId: c.id } : prev))}
                        >
                          <Icon
                            name={resolveIconKey(c.icon, 'category')}
                            size={14}
                            color={selected ? colors.onPrimary : colors.text}
                          />
                          <Text
                            style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 13 }}
                            numberOfLines={1}
                          >
                            {c.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                {/* 分类预算编辑器：显示该周期总预算待分配，作为分配参考 */}
                {editor?.categoryId != null && allocation && (
                  <Text style={[styles.subText, { marginTop: 6 }]}>
                    {zh.budgets.toAllocate} {formatCents(allocation.toAllocate)}（{scope}{zh.budgets.totalBudget}）
                  </Text>
                )}

                <Text style={styles.fieldLabel}>{zh.budgets.amount(editingScope)}</Text>
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
                          { borderColor: selected ? colors.primary : colors.border },
                          selected && { backgroundColor: colors.primary },
                        ]}
                        onPress={() => setEditor((prev) => (prev ? { ...prev, alertPct: pct } : prev))}
                      >
                        <Text style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 13 }}>{pct}%</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.subText, { marginTop: 4 }]}>{zh.budgets.alertPctHint}</Text>
              </ScrollView>

              <View style={{ marginTop: 16 }}>
                <ActionButton label={zh.common.save} onPress={handleSave} pending={upsert.isPending} />
              </View>
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
    segmentWrap: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 3,
      margin: 12,
      marginBottom: 0,
    },
    segment: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
    segmentActive: { backgroundColor: colors.primary },
    monthBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      paddingVertical: 10,
      marginTop: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    monthArrow: { paddingHorizontal: 24, paddingVertical: 4 },
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
    modalCard: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
    editorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    fieldLabel: { color: colors.textSecondary, fontSize: 13, marginTop: 14, marginBottom: 8 },
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
    saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    saveBtnText: { color: colors.onPrimary, fontSize: 16, fontWeight: '600' },
    deleteBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  });
}
