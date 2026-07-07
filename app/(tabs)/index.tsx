import { StyleSheet, Text, View } from 'react-native';
import { zh } from '@/i18n/zh';
import { useTheme } from '@/theme';

export default function TransactionsScreen() {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <Text style={{ color: theme.colors.textSecondary }}>{zh.common.empty}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
