import { SecondarySheetScreen } from '@/components/navigation/secondary-sheet-screen';
import { AssetsScreen } from '@/features/dashboard/assets-screen';
import { dashboardText as copy } from '@/features/dashboard/labels';

export default function AssetsRoute() {
  return (
    <SecondarySheetScreen title={copy.assetDetails}>
      <AssetsScreen />
    </SecondarySheetScreen>
  );
}
