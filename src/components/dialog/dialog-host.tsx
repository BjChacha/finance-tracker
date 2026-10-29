import { useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { motion, useTheme } from '@/theme';
import {
  dismissDialog,
  getDialogSnapshot,
  subscribeDialog,
  type DialogButton,
  type DialogButtonStyle,
} from './dialog-store';

/**
 * 全局对话框/轻提示的宿主：挂在应用根视图的最后一层，弹窗用透明 `Modal`
 * 盖住整屏（含底部页签），轻提示用绝对定位浮层，避免额外开一扇原生窗口。
 */
export function DialogHost() {
  const { dialog, toast } = useSyncExternalStore(
    subscribeDialog,
    getDialogSnapshot,
  );
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const stacked = (dialog?.buttons.length ?? 0) > 2;

  return (
    <>
      <Modal
        visible={dialog !== null}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => {
          if (dialog?.cancelable) dismissDialog(null);
        }}
      >
        {dialog && (
          <View style={styles.overlay}>
            <Pressable
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={StyleSheet.absoluteFill}
              onPress={() => {
                if (dialog.cancelable) dismissDialog(null);
              }}
            />
            <View
              accessibilityViewIsModal
              style={[styles.card, { backgroundColor: colors.card }]}
            >
              <View style={styles.body}>
                <Text
                  accessibilityRole="header"
                  style={[styles.title, { color: colors.text }]}
                >
                  {dialog.title}
                </Text>
                {dialog.message ? (
                  <Text style={[styles.message, { color: colors.textSecondary }]}>
                    {dialog.message}
                  </Text>
                ) : null}
              </View>
              <View
                style={[
                  styles.actions,
                  stacked ? styles.actionsStacked : styles.actionsRow,
                  { borderTopColor: colors.border },
                ]}
              >
                {dialog.buttons.map((button, index) => (
                  <Pressable
                    key={`${button.text}-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={button.text}
                    onPress={() => dismissDialog(index)}
                    style={({ pressed }) => [
                      styles.button,
                      stacked ? styles.buttonStacked : styles.buttonRow,
                      index > 0 &&
                        (stacked
                          ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }
                          : {
                              borderLeftWidth: StyleSheet.hairlineWidth,
                              borderLeftColor: colors.border,
                            }),
                      pressed && { backgroundColor: colors.background },
                    ]}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        { color: buttonColor(button, colors) },
                      ]}
                    >
                      {button.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}
      </Modal>
      {toast ? (
        <Animated.View
          key={toast.id}
          pointerEvents="none"
          entering={FadeIn.duration(motion.fast)}
          exiting={FadeOut.duration(motion.exit)}
          style={[styles.toastLayer, { bottom: insets.bottom + 96 }]}
        >
          <View style={[styles.toast, { backgroundColor: colors.text }]}>
            <Text style={[styles.toastText, { color: colors.background }]}>
              {toast.text}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </>
  );
}

function buttonColor(
  button: DialogButton,
  colors: { primary: string; textSecondary: string; expense: string },
): string {
  const style: DialogButtonStyle = button.style ?? 'default';
  if (style === 'destructive') return colors.expense;
  if (style === 'cancel') return colors.textSecondary;
  return colors.primary;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.24)',
  },
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, gap: 6 },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  actions: { borderTopWidth: StyleSheet.hairlineWidth },
  actionsRow: { flexDirection: 'row' },
  actionsStacked: { flexDirection: 'column' },
  button: { alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  buttonRow: { flex: 1 },
  buttonStacked: { minHeight: 46 },
  buttonText: { fontSize: 15, fontWeight: '600' },
  toastLayer: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: {
    maxWidth: '86%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    opacity: 0.92,
  },
  toastText: { fontSize: 13, fontWeight: '500' },
});
