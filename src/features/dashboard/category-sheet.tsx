import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import type { CategorySlice } from '@/features/stats/repository';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';
import { CategoryList } from './category-list';
import { dashboardText as copy } from './labels';

/**
 * 「钱花在哪」的全量分类面板。
 *
 * 面积图（treemap）只放得下前几名，小占比分类的色块根本容不下文字，
 * 所以右下角常驻一个「…」入口，把完整分类列表以底部面板的形式铺开。
 * 列表直接复用 {@link CategoryList}：占比条、对上期变化、下钻行为与页面内一致。
 */
export function CategorySheet({
  visible,
  items,
  previous,
  onPress,
  onClose,
}: {
  visible: boolean;
  items: CategorySlice[];
  previous?: CategorySlice[];
  onPress: (item: CategorySlice) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  if (!visible) return null;
  const total = items.reduce((sum, item) => sum + item.total, 0);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.closeSheet}
        style={styles.mask}
        onPress={onClose}
      >
        <Pressable
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: colors.card }]}
          onPress={() => {}}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text
                accessibilityRole="header"
                style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}
              >
                {copy.allCategories}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                {copy.percent} · {items.length}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.closeSheet}
              hitSlop={10}
              onPress={onClose}
              style={{ padding: 6 }}
            >
              <Icon name="x" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView
            style={{ maxHeight: 420 }}
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
            <CategoryList
              items={items}
              previous={previous}
              onPress={(item) => {
                onClose();
                onPress(item);
              }}
              initiallyExpanded
              expandable={false}
            />
          </ScrollView>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 12,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {copy.sheetTotal}
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: 14,
                fontWeight: '600',
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatCentsWithSymbol(total)}
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    maxHeight: '76%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
});
