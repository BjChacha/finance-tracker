import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAssetHistoryStart } from '@/features/stats/hooks';
import { useTheme } from '@/theme';
import { AssetCard } from './asset-card';
import { dashboardStyles, PeriodControl, QueryNotice } from './components';
import { dashboardText as copy } from './labels';
import { usePeriod } from './use-period';

export function AssetsScreen() {
  const params = useLocalSearchParams();
  const period = usePeriod(params);
  const { colors } = useTheme();
  const [all, setAll] = useState(false);
  const start = useAssetHistoryStart();
  const range = all
    ? { start: start.data ?? period.today, end: period.today }
    : period.range;
  return (
    <ScrollView
      contentContainerStyle={[dashboardStyles.content, { paddingBottom: 40 }]}
      style={{ backgroundColor: colors.background }}
    >
      <PeriodControl
        {...period}
        allSelected={all}
        onSelectAll={() => setAll(true)}
        setPeriod={(next) => {
          setAll(false);
          period.setPeriod(next);
        }}
        shift={(delta) => {
          setAll(false);
          period.shift(delta);
        }}
      />
      {all && (
        <>
          <QueryNotice queries={[start]} />
          <Text style={{ color: colors.textSecondary }}>
            {copy.allHistory} · {range.start} — {range.end}
          </Text>
        </>
      )}
      <AssetCard
        range={range}
        granularity={all ? 'month' : period.granularity}
        detail
        enabled={!all || !!start.data}
      />
    </ScrollView>
  );
}
