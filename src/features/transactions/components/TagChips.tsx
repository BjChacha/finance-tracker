import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';

type Props = {
  /** 交易标签（≤2 字短词，如「智能」）；空数组时什么都不渲染 */
  tags: readonly string[];
  style?: StyleProp<ViewStyle>;
};

/**
 * 交易标签胶囊：交易实体属性 `tags` 的唯一展示形态。
 * 明细行、搜索结果与详情/编辑表单共用，保证同一笔交易在哪都长得一样。
 */
export function TagChips({ tags, style }: Props) {
  const { colors } = useTheme();
  if (tags.length === 0) return null;
  return (
    <View style={[styles.row, style]}>
      {tags.map((tag) => (
        <View key={tag} style={[styles.chip, { borderColor: colors.primary }]}>
          <Text style={[styles.label, { color: colors.primary }]} numberOfLines={1}>
            {tag}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 10, fontWeight: '600' },
});
