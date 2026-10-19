import { useMemo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { Card, dashboardStyles } from "@/features/dashboard/components";
import { dayjs, formatPeriodTitle } from "@/lib/date";
import { useTheme } from "@/theme";
import { useReportList } from "../hooks";
import { reportsText as copy } from "../labels";
import type { ReportSummary } from "../repository";

type YearGroup = { year: string; reports: ReportSummary[] };

/** Newest first, grouped by calendar year of the period (not of generation). */
function groupByYear(reports: ReportSummary[]): YearGroup[] {
	const groups: YearGroup[] = [];
	for (const report of reports) {
		const year = report.periodKey.slice(0, 4);
		const current = groups[groups.length - 1];
		if (current?.year === year) current.reports.push(report);
		else groups.push({ year, reports: [report] });
	}
	return groups;
}

export function ReportList({
	onOpen,
}: {
	onOpen: (report: ReportSummary) => void;
}) {
	const { colors } = useTheme();
	const list = useReportList();
	const groups = useMemo(() => groupByYear(list.data ?? []), [list.data]);

	if (list.isPending) {
		return (
			<View style={{ paddingVertical: 48, alignItems: "center" }}>
				<ActivityIndicator color={colors.primary} />
			</View>
		);
	}

	return (
		<View style={{ gap: 16 }}>
			<Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
				{copy.autoScheduleHint}
			</Text>
			{groups.length === 0 ? (
				<Card>
					<Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
						{copy.historyEmpty}
					</Text>
				</Card>
			) : (
				groups.map((group) => (
					<View key={group.year} style={{ gap: 8 }}>
						<Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600", paddingHorizontal: 4 }}>
							{group.year}
						</Text>
						<View style={[styles.card, { backgroundColor: colors.card }]}>
							{group.reports.map((report, index) => (
								<Pressable
									key={`${report.period}-${report.periodKey}`}
									accessibilityRole="button"
									accessibilityLabel={formatPeriodTitle(report.period, report.periodKey)}
									onPress={() => onOpen(report)}
									style={({ pressed }) => [
										styles.row,
										index > 0 && {
											borderTopWidth: 0.5,
											borderTopColor: colors.border,
										},
										pressed && { opacity: 0.65 },
									]}
								>
									<View style={{ flex: 1, gap: 3 }}>
										<View style={styles.titleRow}>
											<Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
												{formatPeriodTitle(report.period, report.periodKey)}
											</Text>
											<View style={[styles.moodChip, { backgroundColor: colors.border }]}>
												<Text style={{ color: colors.text, fontSize: 10 }}>
													{report.moodLabel}
												</Text>
											</View>
										</View>
										<Text
											numberOfLines={1}
											style={{ color: colors.textSecondary, fontSize: 12 }}
										>
											{report.headline}
										</Text>
										<Text style={{ color: colors.textSecondary, fontSize: 10 }}>
											{copy.generatedAt}{" "}
											{dayjs(report.generatedAt).format("YYYY-MM-DD HH:mm")}
										</Text>
									</View>
									<Icon name="chevron-right" size={18} color={colors.textSecondary} />
								</Pressable>
							))}
						</View>
					</View>
				))
			)}
		</View>
	);
}

const styles = {
	card: { borderRadius: 12, overflow: "hidden" as const },
	row: {
		flexDirection: "row" as const,
		alignItems: "center" as const,
		gap: 10,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	titleRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
	moodChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
};
