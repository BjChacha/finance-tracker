import { StyleSheet, Text, View } from 'react-native';
import { zh } from '@/i18n/zh';
import { useTheme } from '@/theme';

/** 图表空数据占位 */
export function ChartEmpty() {
  const theme = useTheme();
  return (
    <View style={styles.box}>
      <Text style={{ color: theme.colors.textSecondary }}>{zh.common.empty}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 120, alignItems: 'center', justifyContent: 'center' },
});
