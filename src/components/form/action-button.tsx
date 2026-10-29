import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { showDialog } from '@/components/dialog';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Icon, type IconName } from "@/components/Icon";
import { zh } from "@/i18n/zh";
import { motion, useTheme } from "@/theme";
import { formLabels } from "./labels";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  label: string;
  onPress: () => void | Promise<unknown>;
  disabled?: boolean;
  pending?: boolean;
  icon?: IconName;
  testID?: string;
};

export function ActionButton({ label, onPress, disabled = false, pending = false, icon = "check", testID }: Props) {
  const { colors } = useTheme();
  const locked = useRef(false);
  const [running, setRunning] = useState(false);
  const scale = useSharedValue(1);
  const busy = pending || running;
  const unavailable = disabled || busy;
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  async function activate() {
    if (locked.current || unavailable) return;
    locked.current = true;
    setRunning(true);
    try {
      await onPress();
    } catch (error) {
      showDialog(zh.common.error, error instanceof Error ? error.message : formLabels.saveFailed);
    } finally {
      locked.current = false;
      setRunning(false);
    }
  }

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={busy ? formLabels.saving : label}
      accessibilityState={{ disabled: unavailable, busy }}
      disabled={unavailable}
      onPress={() => void activate()}
      onPressIn={() => scale.set(withTiming(0.97, { duration: motion.fast, easing: Easing.out(Easing.cubic) }))}
      onPressOut={() => scale.set(withTiming(1, { duration: motion.fast, easing: Easing.out(Easing.cubic) }))}
      style={[styles.button, { backgroundColor: colors.primary, opacity: unavailable && !busy ? 0.45 : 1 }, animatedStyle]}
    >
      {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Icon name={icon} size={20} color={colors.onPrimary} />}
      <Text style={[styles.label, { color: colors.onPrimary }]}>{busy ? formLabels.saving : label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 54, borderRadius: 18, paddingHorizontal: 20, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  label: { fontSize: 16, fontWeight: "700", flexShrink: 1, textAlign: "center" },
});
