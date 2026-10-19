import { useLocalSearchParams } from "expo-router";
import { SecondarySheetScreen } from "@/components/navigation/secondary-sheet-screen";
import { ReportDetailScreen } from "@/features/reports/components/report-detail";
import { reportsText as copy } from "@/features/reports/labels";

const PERIODS = ["month", "quarter", "year"] as const;
type Period = (typeof PERIODS)[number];

function param(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

function parsePeriod(value: string | undefined): Period {
	return PERIODS.includes(value as Period) ? (value as Period) : "month";
}

/** One stored report, addressed by period + periodKey. */
export default function ReportDetailRoute() {
	const params = useLocalSearchParams<{
		period?: string | string[];
		key?: string | string[];
	}>();
	const periodKey = param(params.key);
	return (
		<SecondarySheetScreen title={copy.title}>
			{periodKey ? (
				<ReportDetailScreen period={parsePeriod(param(params.period))} periodKey={periodKey} />
			) : null}
		</SecondarySheetScreen>
	);
}
