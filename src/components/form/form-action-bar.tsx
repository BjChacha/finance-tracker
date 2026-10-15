import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { Keyboard, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";
import { ActionButton } from "./action-button";

type Props = ComponentProps<typeof ActionButton> & {
  hint?: string;
  keyboardAware?: boolean;
};

export function FormActionBar({ hint, keyboardAware = true, ...action }: Props) {
  const { colors } = useTheme();
  const anchor = useRef<View>(null);
  const keyboardTop = useRef<number | null>(null);
  const insetRef = useRef(0);
  const [inset, setInset] = useState(0);

  const updatePosition = useCallback(() => {
    anchor.current?.measureInWindow((_left, top, _width, height) => {
      const overlap = keyboardAware && keyboardTop.current !== null
        ? Math.max(0, top + height + insetRef.current - keyboardTop.current)
        : 0;
      insetRef.current = overlap;
      setInset(overlap);
    });
  }, [keyboardAware]);

  useEffect(() => {
    if (!keyboardAware) return;
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      updatePosition();
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTop.current = null;
      insetRef.current = 0;
      setInset(0);
    });
    const metrics = Keyboard.metrics();
    if (metrics) { keyboardTop.current = metrics.screenY; updatePosition(); }
    return () => { show.remove(); hide.remove(); };
  }, [keyboardAware, updatePosition]);

  return (
    <View ref={anchor} collapsable={false} onLayout={updatePosition} style={{ marginBottom: inset }}>
      <View style={[styles.bar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        {hint ? <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text> : null}
        <ActionButton {...action} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  hint: { fontSize: 12, lineHeight: 18, textAlign: "center" },
});
