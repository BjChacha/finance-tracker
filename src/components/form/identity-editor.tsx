import { useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { showDialog } from '@/components/dialog';
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/Icon";
import { IconBubble } from "@/components/IconBubble";
import { SingleLineTextInput } from "@/components/single-line-text-input";
import { SheetHeaderIconButton } from "@/components/navigation/secondary-sheet-screen";
import { zh } from "@/i18n/zh";
import { motion, useTheme } from "@/theme";
import { ActionButton } from "./action-button";
import { confirmDiscard } from "./confirm-discard";
import { formLabels } from "./labels";

type Identity = { name: string; icon: IconName; color: string };
type Props = {
  title: string;
  initial: Identity;
  icons: readonly IconName[];
  colors: readonly string[];
  placeholder: string;
  onSave: (value: Identity) => Promise<unknown>;
  onClose: () => void;
};

export function IdentityEditor({ title, initial, icons, colors: options, placeholder, onSave, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initial.name);
  const [icon, setIcon] = useState(initial.icon);
  const [color, setColor] = useState(initial.color);
  const [expanded, setExpanded] = useState(false);
  const firstIcons = icons.slice(0, 12);
  const visibleIcons = expanded ? icons : firstIcons.includes(icon) ? firstIcons : [...firstIcons.slice(0, 11), icon];
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const checkingDismiss = useRef(false);
  const dirty = name !== initial.name || icon !== initial.icon || color !== initial.color;

  async function close() {
    if (locked.current || checkingDismiss.current) return;
    checkingDismiss.current = true;
    try {
      if (!dirty || await confirmDiscard()) onClose();
    } finally {
      checkingDismiss.current = false;
    }
  }

  async function save() {
    if (!name.trim() || locked.current) return;
    locked.current = true;
    setPending(true);
    try {
      await onSave({ name: name.trim(), icon, color });
      onClose();
    } catch (error) {
      showDialog(zh.common.error, error instanceof Error ? error.message : formLabels.saveFailed);
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={() => void close()}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={zh.common.close} onPress={() => void close()} />
        <Animated.View entering={FadeInDown.duration(motion.enter)} accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.handleRow}><View style={[styles.handle, { backgroundColor: colors.border }]} /></View>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
            <SheetHeaderIconButton icon="x" label={zh.common.close} onPress={() => void close()} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.content}>
            <View style={[styles.preview, { backgroundColor: colors.background }]}>
              <IconBubble name={icon} color={color} size={48} />
              <Text numberOfLines={2} style={[styles.previewText, { color: colors.text }]}>{name.trim() || placeholder}</Text>
            </View>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{formLabels.name}</Text>
            <SingleLineTextInput accessibilityLabel={formLabels.name} value={name} onChangeText={setName} placeholder={placeholder} placeholderTextColor={colors.textSecondary} returnKeyType="done" onSubmitEditing={() => { if (name.trim()) void save(); }} style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
            <Text style={[styles.label, { color: colors.textSecondary }]}>{formLabels.icon}</Text>
            <View style={styles.grid}>
              {visibleIcons.map((option) => (
                <Pressable key={option} accessibilityRole="radio" accessibilityLabel={option} accessibilityState={{ checked: icon === option }} onPress={() => setIcon(option)} style={({ pressed }) => [styles.option, { borderColor: icon === option ? colors.primary : colors.border, backgroundColor: icon === option ? `${colors.primary}20` : colors.background, opacity: pressed ? 0.6 : 1 }]}>
                  <Icon name={option} size={22} color={colors.text} />
                </Pressable>
              ))}
            </View>
            {icons.length > 12 && (
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={({ pressed }) => [styles.expand, { opacity: pressed ? 0.6 : 1 }]}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{expanded ? formLabels.fewerIcons : formLabels.moreIcons}</Text>
                <View style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}><Icon name="chevron-down" size={16} color={colors.textSecondary} /></View>
              </Pressable>
            )}
            <Text style={[styles.label, { color: colors.textSecondary }]}>{formLabels.color}</Text>
            <View style={styles.grid}>
              {options.map((option) => (
                <Pressable key={option} accessibilityRole="radio" accessibilityLabel={`${formLabels.color} ${option}`} accessibilityState={{ checked: color === option }} onPress={() => setColor(option)} style={({ pressed }) => [styles.option, { borderColor: color === option ? colors.text : colors.border, opacity: pressed ? 0.6 : 1 }]}>
                  <View style={[styles.swatch, { backgroundColor: option }]} />
                  {color === option && <View style={[styles.check, { backgroundColor: colors.card }]}><Icon name="check" size={12} color={colors.text} /></View>}
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <View style={styles.actions}><ActionButton label={zh.common.save} disabled={!name.trim()} pending={pending} onPress={save} /></View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { maxHeight: "90%", borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" },
  handleRow: { alignItems: "center", paddingTop: 10 },
  handle: { width: 32, height: 4, borderRadius: 2 },
  header: { flexDirection: "row", alignItems: "center", paddingLeft: 20, paddingRight: 8, paddingVertical: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  scroll: { flexShrink: 1 },
  content: { padding: 20, paddingTop: 4 },
  preview: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 20, marginBottom: 4 },
  previewText: { fontSize: 18, fontWeight: "600", flex: 1 },
  label: { fontSize: 13, fontWeight: "600", marginTop: 16, marginBottom: 10 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  expand: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  option: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  check: { position: "absolute", right: 1, bottom: 1, borderRadius: 8, padding: 2 },
  actions: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
});
