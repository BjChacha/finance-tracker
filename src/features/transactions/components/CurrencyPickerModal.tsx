import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { SUPPORTED_CURRENCIES, useRates } from '@/features/currency';
import { zh } from '@/i18n/zh';
import { currencySymbol, formatRateToCNY } from '@/lib/money';
import { useTheme, type AppTheme } from '@/theme';

type Props = {
  visible: boolean;
  /** 当前选中的币种 ISO code */
  selected: string;
  /** 符号列着色（记账表单里跟随交易类型色） */
  accentColor: string;
  onSelect: (code: string) => void;
  onClose: () => void;
};

/** 币种选择器：居中 fade，列出所有支持币种（含对 CNY 汇率快照） */
export function CurrencyPickerModal({ visible, selected, accentColor, onSelect, onClose }: Props) {
  const theme = useTheme();
  const { colors } = theme;
  const { data: ratesCache } = useRates();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
          <Text style={styles.title}>{zh.currency.pickTitle}</Text>
          <ScrollView>
            {SUPPORTED_CURRENCIES.map((code) => {
              const isSelected = code === selected;
              return (
                <Pressable
                  key={code}
                  style={[styles.row, isSelected && { backgroundColor: `${colors.primary}18` }]}
                  onPress={() => {
                    onSelect(code);
                    onClose();
                  }}
                >
                  <Text style={[styles.rowSym, { color: accentColor }]}>{currencySymbol(code)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowCode}>{code}</Text>
                    <Text style={styles.rowName}>{zh.currencyNames[code]}</Text>
                  </View>
                  <Text style={styles.rowRate}>
                    {code === 'CNY'
                      ? zh.currency.base
                      : `${zh.currency.rateLabel(code)} ${formatRateToCNY(ratesCache?.rates?.[code])} ${zh.currency.rateUnit}`}
                  </Text>
                  {isSelected && <Icon name="check" size={20} color={colors.primary} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles({ colors }: AppTheme) {
  return StyleSheet.create({
    mask: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 24,
    },
    sheet: { borderRadius: 14, padding: 8, maxHeight: '80%' },
    title: {
      color: colors.textSecondary,
      fontSize: 13,
      paddingHorizontal: 8,
      paddingTop: 8,
      paddingBottom: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 8,
    },
    rowSym: { fontSize: 20, width: 40, textAlign: 'center' },
    rowCode: { color: colors.text, fontSize: 15, fontWeight: '500' },
    rowName: { color: colors.textSecondary, fontSize: 13 },
    rowRate: { color: colors.textSecondary, fontSize: 12, marginRight: 8 },
  });
}
