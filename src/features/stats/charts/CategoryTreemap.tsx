import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import type { CategorySlice } from '../repository';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';
import { dashboardText as copy } from '@/features/dashboard/labels';
import { treemapLayout } from './treemap-layout';

type Tile = {
  key: string;
  value: number;
  name: string;
  color: string;
  category?: CategorySlice;
};

export function CategoryTreemap({
  items,
  onPress,
  onShowAll,
}: {
  items: CategorySlice[];
  onPress: (item: CategorySlice) => void;
  onShowAll: () => void;
}) {
  const { colors, dark } = useTheme();
  const [width, setWidth] = useState(0);
  const sorted = items
    .filter((item) => item.total > 0)
    .slice()
    .sort((a, b) => b.total - a.total);
  const total = sorted.reduce((sum, item) => sum + item.total, 0);
  const tiles: Tile[] = sorted.slice(0, 5).map((category) => ({
    key: category.categoryId,
    name: category.name,
    value: category.total,
    color: category.color,
    category,
  }));
  const remainder = sorted.slice(5).reduce((sum, item) => sum + item.total, 0);
  if (remainder > 0)
    tiles.push({
      key: 'remainder',
      name: copy.otherCategories,
      value: remainder,
      color: colors.textSecondary,
    });
  if (total <= 0) return null;
  const height = 132;
  const cornerWidth = 48;
  const cornerHeight = 32;
  return (
    <View>
      <View
        testID="category-treemap"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ height, width: '100%' }}
      >
        {treemapLayout(tiles, width, height).map(
          ({ item, x, y, width: w, height: h }) => {
            // 小色块也要能认出是什么：只按容纳一行小字的最低尺寸判断，
            // 字号随宽度收缩，超宽内容省略号截断（以前整块空白＝看不出分类）。
            const showName = w >= 34 && h >= 20;
            const showPct = w >= 52 && h >= 56;
            const interactive = w >= 44 && h >= 44;
            const padding = showName
              ? Math.min(10, Math.max(3, Math.round(w / 10)))
              : 0;
            const Container = interactive ? Pressable : View;
            const pct = Math.round((item.value / total) * 1000) / 10;
            return (
              <Container
                key={item.key}
                disabled={!interactive}
                accessible={interactive}
                importantForAccessibility={
                  interactive ? 'auto' : 'no-hide-descendants'
                }
                accessibilityElementsHidden={!interactive}
                accessibilityRole={interactive ? 'button' : undefined}
                accessibilityLabel={
                  interactive
                    ? `${item.name} ${formatCentsWithSymbol(item.value)} ${pct}%`
                    : undefined
                }
                onPress={
                  interactive
                    ? () =>
                        item.category ? onPress(item.category) : onShowAll()
                    : undefined
                }
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  width: w,
                  height: h,
                  borderWidth: 1.5,
                  borderColor: colors.background,
                  borderRadius: 7,
                  overflow: 'hidden',
                  justifyContent: 'center',
                  padding,
                  backgroundColor: colors.card,
                }}
              >
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: item.color,
                    opacity: dark ? 0.28 : 0.18,
                  }}
                />
                {showName && (
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={{
                      fontSize: w >= 90 ? 12 : 10,
                      color: colors.text,
                      fontWeight: '600',
                    }}
                  >
                    {item.name}
                  </Text>
                )}
                {showPct && (
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: w > 100 ? 22 : 15,
                      color: colors.text,
                      fontWeight: '600',
                      fontVariant: ['tabular-nums'],
                      marginTop: 3,
                    }}
                  >
                    {pct}%
                  </Text>
                )}
              </Container>
            );
          },
        )}
        {/* 右下角常驻入口：面积图放不下的小分类在这里能看全 */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.allCategories}
          hitSlop={{ top: 10, left: 10 }}
          onPress={onShowAll}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: cornerWidth,
            height: cornerHeight,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.card,
            borderTopLeftRadius: 8,
            borderBottomRightRadius: 7,
            borderWidth: 1.5,
            borderColor: colors.background,
          }}
        >
          <Icon name="more-horizontal" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 7 }}>
        {copy.areaMeaning}
      </Text>
    </View>
  );
}
