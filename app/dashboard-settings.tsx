import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { SecondarySheetScreen } from '@/components/navigation/secondary-sheet-screen';
import { zh } from '@/i18n/zh';
import { useTheme, type AppTheme } from '@/theme';
import {
  DASHBOARD_SECTION_META,
  DEFAULT_LAYOUT,
  normalizeLayout,
  useDashboardLayout,
  useSetDashboardLayout,
  type DashboardLayout,
  type DashboardSectionKey,
} from '@/features/dashboard/sections';

function makeStyles(theme: AppTheme) {
  const { colors } = theme;
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 12,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    title: { color: colors.text, fontSize: 15, flex: 1 },
    moveBtn: { paddingHorizontal: 10, paddingVertical: 8, minWidth: 44, alignItems: 'center' },
    moveText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
    moveTextDisabled: { color: colors.border, fontSize: 15, fontWeight: '600' },
    hideBtn: {
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    hideText: { color: colors.textSecondary, fontSize: 12 },
    restoreText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    hiddenTitle: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 20,
      marginBottom: 6,
    },
    emptyHidden: {
      color: colors.textSecondary,
      fontSize: 13,
      paddingVertical: 10,
    },
    desc: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      marginBottom: 12,
    },
  });
}

/**
 * 首页模块设置：显隐 + 上下移排序（原生按钮，不引入拖拽库）。
 * 隐藏的模块在首页完全不渲染，其查询也不执行。
 */
export default function DashboardSettingsScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const layoutQuery = useDashboardLayout();
  const setLayout = useSetDashboardLayout();
  const layout = layoutQuery.data ?? DEFAULT_LAYOUT;

  function persist(next: DashboardLayout) {
    setLayout.mutate(normalizeLayout(next));
  }

  function move(key: DashboardSectionKey, delta: -1 | 1) {
    const shown = layout.order.filter((k) => !layout.hidden.includes(k));
    const index = shown.indexOf(key);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= shown.length) return;
    [shown[index], shown[target]] = [shown[target]!, shown[index]!];
    // 隐藏项保持在 order 尾部，恢复时按原相对位置回到末尾
    const hiddenPart = layout.order.filter((k) => layout.hidden.includes(k));
    persist({ order: [...shown, ...hiddenPart], hidden: layout.hidden });
  }

  function toggleVisible(key: DashboardSectionKey, hide: boolean) {
    const hidden = hide
      ? [...new Set([...layout.hidden, key])]
      : layout.hidden.filter((k) => k !== key);
    persist({ order: layout.order, hidden });
  }

  const shown = layout.order.filter((key) => !layout.hidden.includes(key));
  const hidden = layout.order.filter((key) => layout.hidden.includes(key));

  const renderRow = (
    key: DashboardSectionKey,
    index: number,
    total: number,
    hiddenMode: boolean,
  ) => {
    const meta = DASHBOARD_SECTION_META[key];
    return (
      <View key={key}>
        {index > 0 && <View style={styles.rowDivider} />}
        <View style={styles.row}>
          <Icon name={meta.icon as never} size={18} color={colors.primary} />
          <Text style={styles.title}>{meta.title}</Text>
          {hiddenMode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`恢复${meta.title}`}
              style={styles.moveBtn}
              onPress={() => toggleVisible(key, false)}
            >
              <Text style={styles.restoreText}>恢复</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${meta.title}上移`}
                disabled={index === 0}
                style={styles.moveBtn}
                onPress={() => move(key, -1)}
              >
                <Text style={index === 0 ? styles.moveTextDisabled : styles.moveText}>
                  ↑
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${meta.title}下移`}
                disabled={index === total - 1}
                style={styles.moveBtn}
                onPress={() => move(key, 1)}
              >
                <Text
                  style={
                    index === total - 1 ? styles.moveTextDisabled : styles.moveText
                  }
                >
                  ↓
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`隐藏${meta.title}`}
                style={styles.hideBtn}
                onPress={() => toggleVisible(key, true)}
              >
                <Text style={styles.hideText}>隐藏</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <SecondarySheetScreen title={zh.profile.dashboardModules}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >
        <Text style={styles.desc}>
          按需调整首页模块：↑↓ 改变顺序，「隐藏」收起整个模块。被隐藏的模块不会加载任何数据。
        </Text>
        <View style={styles.card}>
          {shown.map((key, i) => renderRow(key, i, shown.length, false))}
        </View>
        <Text style={styles.hiddenTitle}>已隐藏</Text>
        <View style={styles.card}>
          {hidden.length === 0 ? (
            <Text style={styles.emptyHidden}>没有隐藏的模块</Text>
          ) : (
            hidden.map((key, i) => renderRow(key, i, hidden.length, true))
          )}
        </View>
      </ScrollView>
    </SecondarySheetScreen>
  );
}
