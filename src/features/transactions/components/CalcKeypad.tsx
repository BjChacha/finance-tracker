import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type AppTheme } from '@/theme';

type Props = {
  onKey: (key: string) => void;
  onDone: () => void;
};

// label = 显示字形；value = 发给 appendCalcKey 的字节。
// 减号 value 必须 ASCII '-'（money.ts parseMoneyToCents 不认 U+2212）；加号 ASCII '+'。
const OP_KEYS: { label: string; value: string }[] = [
  { label: '÷', value: '÷' },
  { label: '×', value: '×' },
  { label: '+', value: '+' },
  { label: '−', value: '-' },
];

const DIGIT_ROWS: { label: string; value: string }[][] = [
  [{ label: '7', value: '7' }, { label: '8', value: '8' }, { label: '9', value: '9' }],
  [{ label: '4', value: '4' }, { label: '5', value: '5' }, { label: '6', value: '6' }],
  [{ label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3', value: '3' }],
];

export function CalcKeypad({ onKey, onDone }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(theme);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      {/* 运算符：顶部一行 */}
      <View style={styles.opRow}>
        {OP_KEYS.map((k) => (
          <Pressable key={k.value} style={styles.opKey} onPress={() => onKey(k.value)}>
            <Text style={styles.opLabel}>{k.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* 主区：左数字块（0 双倍宽） + 右列(C / ⌫ / OK，OK 占 2 格高) */}
      <View style={styles.mainRow}>
        <View style={styles.digitBlock}>
          {DIGIT_ROWS.map((row, ri) => (
            <View key={ri} style={styles.digitRow}>
              {row.map((k) => (
                <Pressable key={k.value} style={styles.digitKey} onPress={() => onKey(k.value)}>
                  <Text style={styles.digitLabel}>{k.label}</Text>
                </Pressable>
              ))}
            </View>
          ))}
          <View style={styles.digitRow}>
            <Pressable style={styles.digitKey} onPress={() => onKey('.')}>
              <Text style={styles.digitLabel}>.</Text>
            </Pressable>
            <Pressable style={[styles.digitKey, { flex: 2 }]} onPress={() => onKey('0')}>
              <Text style={styles.digitLabel}>0</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.rightCol}>
          <Pressable style={styles.sideKey} onPress={() => onKey('C')}>
            <Text style={styles.sideLabel}>C</Text>
          </Pressable>
          <Pressable style={styles.sideKey} onPress={() => onKey('⌫')}>
            <Text style={styles.sideLabel}>⌫</Text>
          </Pressable>
          <Pressable style={[styles.sideKey, styles.okKey]} onPress={onDone}>
            <Text style={styles.okLabel}>OK</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function makeStyles({ colors }: AppTheme) {
  const hair = StyleSheet.hairlineWidth;
  return StyleSheet.create({
    root: {
      backgroundColor: colors.card,
      borderTopWidth: hair,
      borderTopColor: colors.border,
    },
    opRow: { flexDirection: 'row' },
    opKey: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderRightWidth: hair,
      borderBottomWidth: hair,
      borderColor: colors.border,
    },
    opLabel: { fontSize: 22, fontWeight: '500', color: colors.text },
    mainRow: { flexDirection: 'row' },
    digitBlock: { flex: 3 },
    digitRow: { flexDirection: 'row' },
    digitKey: {
      flex: 1,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderRightWidth: hair,
      borderBottomWidth: hair,
      borderColor: colors.border,
    },
    digitLabel: { fontSize: 24, color: colors.text },
    rightCol: { flex: 1, flexDirection: 'column' },
    sideKey: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderLeftWidth: hair,
      borderBottomWidth: hair,
      borderColor: colors.border,
    },
    sideLabel: { fontSize: 22, fontWeight: '500', color: colors.text },
    okKey: { flex: 2, backgroundColor: colors.primary },
    okLabel: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  });
}
