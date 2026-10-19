import { useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { SecondarySheetScreen } from "@/components/navigation/secondary-sheet-screen";
import { dashboardStyles } from "@/features/dashboard/components";
import { ReportList } from "@/features/reports/components/report-list";
import { reportsText as copy } from "@/features/reports/labels";
import { useTheme } from "@/theme";

/** History of persisted period reports; opening one never calls the model. */
export default function ReportsRoute() {
	const router = useRouter();
	const { colors } = useTheme();
	return (
		<SecondarySheetScreen title={copy.title}>
			<ScrollView
				style={{ flex: 1, backgroundColor: colors.background }}
				contentContainerStyle={[dashboardStyles.content, { paddingBottom: 40 }]}
			>
				<ReportList
					onOpen={(report) =>
						router.push({
							pathname: "/reports/detail",
							params: { period: report.period, key: report.periodKey },
						})
					}
				/>
			</ScrollView>
		</SecondarySheetScreen>
	);
}
