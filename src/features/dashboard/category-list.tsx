import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import type { CategorySlice } from '@/features/stats/repository';
import { CategoryTreemap } from '@/features/stats/charts/CategoryTreemap';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';
import { dashboardStyles, TextAction } from './components';
import { dashboardText as copy } from './labels';

export function CategoryList({
  items,
  previous,
  onPress,
  initiallyExpanded = false,
  showComposition = false,
}: {
  items: CategorySlice[];
  previous?: CategorySlice[];
  onPress: (item: CategorySlice) => void;
  initiallyExpanded?: boolean;
  showComposition?: boolean;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const before = new Map(
    previous?.map((item) => [item.categoryId, item.total]),
  );
  const total = Math.max(
    1,
    items.reduce((sum, item) => sum + item.total, 0),
  );
  if (!items.length)
    return (
      <Text style={{ color: colors.textSecondary, lineHeight: 22 }}>
        {copy.emptySpending}
      </Text>
    );
  return (
    <View style={{ gap: 6 }}>
      {showComposition && (
        <CategoryTreemap
          items={items}
          onPress={onPress}
          onShowAll={() => setExpanded(true)}
        />
      )}
      {(expanded ? items : items.slice(0, 5)).map((item) => {
        const delta = item.total - (before.get(item.categoryId) ?? 0);
        return (
          <Pressable
            key={item.categoryId}
            accessibilityRole="button"
            accessibilityLabel={`${item.name} ${formatCentsWithSymbol(item.total)} ${item.pct}% ${copy.details}`}
            onPress={() => onPress(item)}
            style={{ minHeight: 48, paddingVertical: 8, gap: 5 }}
          >
            <View style={dashboardStyles.between}>
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: item.color,
                  }}
                />
                <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>
                  {item.name}
                </Text>
              </View>
              <Text
                style={[
                  dashboardStyles.number,
                  { color: colors.text, fontSize: 14 },
                ]}
              >
                {formatCentsWithSymbol(item.total)}
              </Text>
              <Icon
                name="chevron-right"
                size={14}
                color={colors.textSecondary}
              />
            </View>
            {!showComposition && (
              <View
                style={{
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: colors.border,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: 5,
                    borderRadius: 3,
                    width: `${(item.total / total) * 100}%`,
                    backgroundColor: item.color,
                  }}
                />
              </View>
            )}
            <View style={dashboardStyles.between}>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                {copy.percent} {item.pct}%
              </Text>
              {previous && (
                <Text
                  style={{
                    fontSize: 11,
                    color:
                      delta > 0
                        ? colors.expense
                        : delta < 0
                          ? colors.income
                          : colors.textSecondary,
                  }}
                >
                  {copy.versus} {delta > 0 ? '+' : ''}
                  {formatCentsWithSymbol(delta)}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}
      {items.length > 5 && (
        <TextAction
          label={expanded ? copy.showLess : copy.showAll}
          onPress={() => setExpanded(!expanded)}
        />
      )}
    </View>
  );
}
