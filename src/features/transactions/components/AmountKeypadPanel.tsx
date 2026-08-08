import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';
import { AmountDisplay } from './AmountDisplay';
import { CalcKeypad } from './CalcKeypad';

type Props = {
  amountText: string;
  currency: string;
  accentColor: string;
  onKey: (key: string) => void;
  onDone: () => void;
  /** 传入则显示区货币符号可点（打开币种选择器） */
  onPressCurrency?: () => void;
  /** 置灰并禁用 OK/确认键（快捷记账阶段金额为空/0 时用） */
  okDisabled?: boolean;
};

/**
 * 记账键盘面板 = 顶部金额显示区 + 计算器键盘。
 * 仅负责面板本体（card 底、顶部圆角）；遮罩与进出场动画由使用方包裹。
 * 底部安全区由 CalcKeypad 自理；键盘自带的顶部 hairline 恰为显示区与键区的分隔线。
 */
export function AmountKeypadPanel({
  amountText,
  currency,
  accentColor,
  onKey,
  onDone,
  onPressCurrency,
  okDisabled,
}: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.panel, { backgroundColor: colors.card }]}>
      <AmountDisplay
        amountText={amountText}
        currency={currency}
        accentColor={accentColor}
        onPressCurrency={onPressCurrency}
      />
      <CalcKeypad onKey={onKey} onDone={onDone} okDisabled={okDisabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
});
