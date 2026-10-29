import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTrend } from '@/features/stats/hooks';
import { TrendLineChart } from '@/features/stats/charts/TrendLineChart';
import { cumulativeComparison } from '@/features/stats/spending-comparison';
import type { DateRange } from '@/lib/analytics-range';
import type { TrendGranularity } from '@/features/stats/transform';
import { useTheme } from '@/theme';
import { QueryNotice, Section, TextAction } from './components';
import { dashboardText as copy } from './labels';

export function SpendingPace({
  range,
  comparison,
  granularity,
  onDetails,
}: {
  range: DateRange;
  comparison: DateRange;
  granularity: TrendGranularity;
  onDetails: () => void;
}) {
  const { colors } = useTheme();
  const current = useTrend('day', range);
  const previous = useTrend('day', comparison);
  const points = useMemo(
    () =>
      cumulativeComparison(
        current.data ?? [],
        previous.data ?? [],
        granularity,
      ),
    [current.data, previous.data, granularity],
  );
  return (
    <Section
      title={copy.spendingPace}
      action={<TextAction label={copy.moreAnalysis} onPress={onDetails} />}
    >
      <Text style={{ fontSize: 11, color: colors.textSecondary }}>
        {copy.cumulativeSpending} · {copy.alignedProgress}
      </Text>
      <QueryNotice queries={[current, previous]} />
      {current.data && previous.data && (
        <View style={{ paddingVertical: 8 }}>
          <TrendLineChart
            points={points}
            primaryColor={colors.primary}
            primaryLabel={copy.currentPeriod}
            secondaryColor={colors.textSecondary}
            secondaryLabel={copy.comparisonPeriod}
            secondaryDashed
            fillPrimary
            height={155}
          />
        </View>
      )}
    </Section>
  );
}
