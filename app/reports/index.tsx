import { SecondarySheetScreen } from "@/components/navigation/secondary-sheet-screen";
import { reportsText as copy } from "@/features/reports/labels";
import { ReportScreen } from "@/features/reports/components/report-screen";

export default function ReportsRoute() {
  return (
    <SecondarySheetScreen title={copy.title}>
      <ReportScreen />
    </SecondarySheetScreen>
  );
}
