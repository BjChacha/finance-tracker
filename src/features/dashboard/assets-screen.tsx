import { ScrollView, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { AssetCard } from './asset-card';
import { dashboardStyles, PeriodControl, QueryNotice } from './components';
import { dashboardText as copy } from './labels';
import { usePeriod } from './use-period';

export function AssetsScreen() {
  const params = useLocalSearchParams();
  const period = usePeriod(params, { withAll: true });
  const { colors } = useTheme();
  return (
    <ScrollView
      contentContainerStyle={[dashboardStyles.content, { paddingBottom: 40 }]}
      style={{ backgroundColor: colors.background }}
    >
      <PeriodControl
        {...period}
        allSelected={period.all}
        onSelectAll={() => period.setAll(true)}
      />
      {period.all && (
        <>
          <QueryNotice queries={[period.allStart]} />
          {period.allStart.data ? (
            <Text style={{ color: colors.textSecondary }}>
              {copy.allHistory} · {period.range.start} — {period.range.end}
            </Text>
          ) : null}
        </>
      )}
      <AssetCard
        range={period.range}
        granularity={period.granularity}
        detail
        enabled={!period.all || !!period.allStart.data}
      />
    </ScrollView>
  );
}
