import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { SecondarySheetScreen } from '@/components/navigation/secondary-sheet-screen';
import { zh } from '@/i18n/zh';
import { getHapticLevelSync, setHapticLevel, type HapticLevel } from '@/lib/haptics';
import { resolveTheme, useTheme, useThemePref, type ThemePref } from '@/theme';

/** 选择器行：偏好 + 文案 */
const ROWS: { pref: ThemePref; label: string }[] = [
  { pref: 'auto', label: zh.appearance.followSystem },
  { pref: 'light', label: zh.appearance.light },
  { pref: 'tiffany', label: zh.appearance.tiffany },
  { pref: 'mint', label: zh.appearance.mint },
  { pref: 'dark', label: zh.appearance.dark },
];

/** 按键震动档位行：关闭 / 轻柔 / 强烈 */
const HAPTIC_ROWS: { level: HapticLevel; label: string }[] = [
  { level: 0, label: zh.appearance.hapticOff },
  { level: 1, label: zh.appearance.hapticLight },
  { level: 2, label: zh.appearance.hapticStrong },
];

/** 色块预览：两段（背景 | 主色）；auto 用 浅色背景 | 深色背景 表达“随系统” */
function ThemeSwatch({ pref, borderColor }: { pref: ThemePref; borderColor: string }) {
  const halves: { flex: number; backgroundColor: string }[] = [];
  if (pref === 'auto') {
    const l = resolveTheme('light', 'light').colors;
    const d = resolveTheme('dark', 'dark').colors;
    halves.push({ flex: 1, backgroundColor: l.background }, { flex: 1, backgroundColor: d.background });
  } else {
    const c = resolveTheme(pref, null).colors;
    halves.push({ flex: 1, backgroundColor: c.background }, { flex: 1, backgroundColor: c.primary });
  }
  return (
    <View style={[styles.swatch, { borderColor }]}>
      {halves.map((h, i) => (
        <View key={i} style={h} />
      ))}
    </View>
  );
}

export default function AppearanceScreen() {
  const { colors } = useTheme();
  const { pref, setPref } = useThemePref();
  const [hapticLevel, setHapticLevelState] = useState<HapticLevel>(getHapticLevelSync);

  return (
    <SecondarySheetScreen title={zh.appearance.title}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16 }}
      >
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {ROWS.map((row, i) => {
            const selected = row.pref === pref;
            return (
              <Pressable
                key={row.pref}
                style={[
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                ]}
                onPress={() => setPref(row.pref)}
              >
                <ThemeSwatch pref={row.pref} borderColor={colors.border} />
                <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{row.label}</Text>
                {selected ? <Icon name="check" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          {zh.appearance.hapticTitle}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {HAPTIC_ROWS.map((row, i) => {
            const selected = row.level === hapticLevel;
            return (
              <Pressable
                key={row.level}
                style={[
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                ]}
                onPress={() => {
                  setHapticLevelState(row.level);
                  void setHapticLevel(row.level);
                }}
              >
                <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{row.label}</Text>
                {selected ? <Icon name="check" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SecondarySheetScreen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  swatch: {
    width: 56,
    height: 24,
    borderRadius: 6,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
});
