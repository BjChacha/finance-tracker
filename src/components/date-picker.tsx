import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Icon } from '@/components/Icon';
import { zh } from '@/i18n/zh';
import { dayjs } from '@/lib/date';
import { motion, useTheme } from '@/theme';

/**
 * 共享日期选择器。
 *
 * DatePickerDialog：从交易表单抽出的平台双端日期对话框（行为与原实现一致）：
 * - Android：系统 spinner 对话框，滚动即选定并关闭；
 * - iOS：遮罩 fade + 底部滚轮面板，点「完成」落值。
 *
 * DatePickerField：触发器字段（样式对齐 SingleLineTextInput），
 * 点击弹 Dialog；clearable 变体支持空值占位与一键清除（如周期「长期」）。
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function DatePickerDialog({
  open,
  value,
  onPick,
  onDismiss,
}: {
  open: boolean;
  /** 当前值 'YYYY-MM-DD'（打开时作为滚轮初始位） */
  value: string;
  /** 选定回调（两平台统一吐回 'YYYY-MM-DD'） */
  onPick: (dateKey: string) => void;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tempDate, setTempDate] = useState<Date>(() => new Date());

  // 打开时把滚轮定位到当前值（value 非法时回落今天）
  useEffect(() => {
    if (!open) return;
    const parsed = dayjs(value, 'YYYY-MM-DD');
    setTempDate(parsed.isValid() ? parsed.toDate() : new Date());
  }, [open, value]);

  if (!open) return null;

  if (Platform.OS === 'android') {
    return (
      <DateTimePicker
        value={tempDate}
        mode="date"
        display="spinner"
        onValueChange={(_event, selected) => {
          onPick(dayjs(selected).format('YYYY-MM-DD'));
        }}
        onDismiss={onDismiss}
      />
    );
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.pickerMask} onPress={onDismiss}>
        <AnimatedPressable
          entering={SlideInDown.duration(motion.enter)}
          style={[
            styles.pickerSheet,
            { backgroundColor: colors.card, paddingBottom: insets.bottom + 8 },
          ]}
          onPress={() => {}}
        >
          <View style={styles.pickerHeader}>
            <Pressable
              onPress={() => {
                onPick(dayjs(tempDate).format('YYYY-MM-DD'));
              }}
            >
              <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>
                {zh.common.done}
              </Text>
            </Pressable>
          </View>
          <DateTimePicker
            value={tempDate}
            mode="date"
            display="spinner"
            onValueChange={(_event, selected) => {
              setTempDate(selected);
            }}
          />
        </AnimatedPressable>
      </Pressable>
    </Modal>
  );
}

export function DatePickerField({
  value,
  onPick,
  placeholder,
  clearable,
  onClear,
  disabled,
  children,
}: {
  /** 'YYYY-MM-DD'；clearable 模式下允许 ''（空值态） */
  value: string;
  onPick: (dateKey: string) => void;
  placeholder?: string;
  /** 显示清除按钮（空值态展示 placeholder），如周期「结束日期=长期」 */
  clearable?: boolean;
  onClear?: () => void;
  disabled?: boolean;
  /** 覆盖默认日期文案（如需更友好格式） */
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const hasValue = value.trim().length > 0;

  return (
    <View style={styles.fieldRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hasValue ? value : (placeholder ?? '')}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          { borderColor: colors.border, opacity: disabled ? 0.45 : pressed ? 0.6 : 1 },
        ]}
      >
        <Text
          style={{ color: hasValue ? colors.text : colors.textSecondary, fontSize: 15 }}
          numberOfLines={1}
        >
          {children ?? (hasValue ? value : (placeholder ?? 'YYYY-MM-DD'))}
        </Text>
        <Icon name="calendar" size={16} color={colors.textSecondary} />
      </Pressable>
      {clearable && hasValue && onClear && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={zh.common.close}
          hitSlop={8}
          onPress={onClear}
          style={styles.clearButton}
        >
          <Icon name="x" size={16} color={colors.textSecondary} />
        </Pressable>
      )}
      <DatePickerDialog
        open={open}
        value={value}
        onPick={(dateKey) => {
          setOpen(false);
          onPick(dateKey);
        }}
        onDismiss={() => setOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pickerMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  pickerHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center' },
  field: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  clearButton: { position: 'absolute', right: 40, padding: 8 },
});
