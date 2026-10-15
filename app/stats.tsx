import { SecondarySheetScreen } from '@/components/navigation/secondary-sheet-screen';
import { StatsScreen } from '@/features/dashboard/stats-screen';
import { dashboardText as copy } from '@/features/dashboard/labels';

export default function StatsRoute() {
  return (
    <SecondarySheetScreen title={copy.categoryAnalysis}>
      <StatsScreen />
    </SecondarySheetScreen>
  );
}
