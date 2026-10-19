import { Platform, Pressable } from "react-native";
import { useRef } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Icon } from "@/components/Icon";
import { isQuickKeypadAvailable, openKeypad } from "@/lib/quickKeypad";
import { motion, useTheme } from "@/theme";
import { dashboardText as copy } from "./labels";
import naturalCopy from "@/features/transactions/natural-language/labels.json";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AddTransactionButton({ bottom }: { bottom: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const opening = useRef(false);
  const longPressed = useRef(false);
  const scale = useSharedValue(1);
  const feedback = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));
  const open = async () => {
    if (Platform.OS !== "android" || !isQuickKeypadAvailable()) {
      router.push("/add-transaction");
      return;
    }
    try {
      const result = await openKeypad();
      if (!result) return;
      router.push({
        pathname: "/add-transaction",
        params: {
          amount: String(Math.abs(result.amountCents)),
          currency: result.currency,
          type: result.amountCents < 0 ? "income" : "expense",
        },
      });
    } catch {
      router.push("/add-transaction");
    }
  };
  const openText = () => {
    if (Platform.OS !== "android") return;
    longPressed.current = true;
    router.push({
      pathname: "/natural-language-transaction",
      params: { source: "app" },
    });
  };
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={copy.add}
      accessibilityHint={
        Platform.OS === "android" ? naturalCopy.entryHint : undefined
      }
      accessibilityActions={
        Platform.OS === "android"
          ? [{ name: "longpress", label: naturalCopy.title }]
          : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "longpress") void openText();
      }}
      onLongPress={
        Platform.OS === "android"
          ? () => {
              void openText();
            }
          : undefined
      }
      onPress={() => {
        if (opening.current || longPressed.current) return;
        opening.current = true;
        void open().finally(() => {
          opening.current = false;
        });
      }}
      onPressIn={() => {
        longPressed.current = false;
        scale.set(withTiming(0.92, { duration: motion.fast }));
      }}
      onPressOut={() => scale.set(withTiming(1, { duration: motion.fast }))}
      style={[
        {
          position: "absolute",
          right: 20,
          bottom,
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.primary,
        },
        feedback,
      ]}
    >
      <Icon name="plus" size={26} color={colors.onPrimary} />
    </AnimatedPressable>
  );
}
