import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { useAssetHistory } from '@/features/stats/hooks';
import type { TrendGranularity } from '@/features/stats/transform';
import { sparklineGeometry } from '@/features/stats/charts/sparkline-geometry';
import type { DateRange } from '@/lib/analytics-range';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme } from '@/theme';
import { dashboardStyles, QueryNotice } from './components';
import { dashboardText as copy } from './labels';

export function AssetSummary({
  range,
  granularity,
  onPress,
}: {
  range: DateRange;
  granularity: TrendGranularity;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const query = useAssetHistory(range, granularity);
  const data = query.data;
  const delta = data ? data.closing.netWorth - data.opening.netWorth : 0;
  const geometry = data
    ? sparklineGeometry(
        data.points.map((point) => point.netWorth),
        88,
        38,
      )
    : null;
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 14,
      }}
    >
      <QueryNotice queries={[query]} />
      {data && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.assetDetails}
          onPress={onPress}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            minHeight: 64,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
              {copy.assetSummary}
            </Text>
            <Text
              selectable
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[
                dashboardStyles.number,
                { color: colors.text, fontSize: 21 },
              ]}
            >
              {formatCentsWithSymbol(data.closing.netWorth)}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
              {data.accounts.length
                ? `${copy.periodChange} ${delta > 0 ? '+' : ''}${formatCentsWithSymbol(delta)}`
                : copy.noAssetHistory}
            </Text>
          </View>
          {geometry && data.accounts.length > 0 && (
            <View pointerEvents="none" accessible={false}>
              <Svg width={88} height={38}>
                {geometry.zeroY !== null && (
                  <Line
                    x1={0}
                    x2={88}
                    y1={geometry.zeroY}
                    y2={geometry.zeroY}
                    stroke={colors.textSecondary}
                    strokeOpacity={0.35}
                    strokeDasharray="3 3"
                  />
                )}
                <Path
                  d={geometry.path}
                  stroke={colors.primary}
                  strokeWidth={2}
                  fill="none"
                />
                <Circle
                  cx={geometry.last.x}
                  cy={geometry.last.y}
                  r={3}
                  fill={colors.primary}
                />
              </Svg>
            </View>
          )}
          <Icon name="chevron-right" size={16} color={colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}
