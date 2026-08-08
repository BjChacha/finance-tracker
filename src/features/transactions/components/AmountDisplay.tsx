import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRates } from '@/features/currency';
import { zh } from '@/i18n/zh';
import {
  currencySymbol,
  formatCents,
  formatCentsWithSymbol,
  parseRateToScaled,
  RATE_SCALE,
} from '@/lib/money';
import { useTheme } from '@/theme';
import { computeAmountPreview } from '../amountPreview';

type Props = {
  /** 金额表达式原文（与计算器键盘共用的字符串状态） */
  amountText: string;
  currency: string;
  /** 符号与金额着色（跟随交易类型色） */
  accentColor: string;
  /** 传入则货币符号可点（打开币种选择器）；不传则为纯展示 */
  onPressCurrency?: () => void;
};

/**
 * 记账键盘顶部显示区：货币符号 + 金额表达式 + 辅助预览。
 * 辅助预览与表单金额框同规则（computeAmountPreview 单一出处）：
 * 含待计算运算符时显示「= 结果」，否则外币正数显示「≈ ¥折算」。
 */
export function AmountDisplay({ amountText, currency, accentColor, onPressCurrency }: Props) {
  const { colors } = useTheme();
  const { data: ratesCache } = useRates();

  const rateScaled =
    currency === 'CNY' ? RATE_SCALE : parseRateToScaled(String(ratesCache?.rates?.[currency] ?? ''));
  const { opPreview, baseCents } = computeAmountPreview(amountText, currency, rateScaled);

  return (
    <View style={styles.row}>
      <Pressable
        hitSlop={8}
        onPress={onPressCurrency}
        disabled={!onPressCurrency}
        style={styles.symbolBtn}
      >
        <Text style={[styles.symbol, { color: accentColor }]}>{currencySymbol(currency)}</Text>
      </Pressable>
      <Text
        style={[styles.amount, { color: amountText ? accentColor : colors.border }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {amountText || zh.txList.amountPlaceholder}
      </Text>
      {opPreview !== null && (
        <Text style={[styles.aux, { color: colors.textSecondary }]}>
          = {formatCents(opPreview, { grouping: false })}
        </Text>
      )}
      {opPreview === null && baseCents !== null && (
        <Text style={[styles.aux, { color: colors.textSecondary }]}>
          ≈ {formatCentsWithSymbol(baseCents, 'CNY')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  symbolBtn: { marginRight: 8 },
  symbol: { fontSize: 20, fontWeight: '600' },
  amount: { flex: 1, fontSize: 28, fontWeight: '700' },
  aux: { fontSize: 15, fontWeight: '500', flexShrink: 1, marginLeft: 8 },
});
