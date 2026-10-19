import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { formatPeriodTitle } from "@/lib/date";
import { useTheme } from "@/theme";
import { useLatestReport } from "../hooks";
import { reportsText as copy } from "../labels";

/**
 * Dashboard entry for the report feature.
 *
 * The newest stored report is the primary target; when none exists yet the card explains the
 * automatic schedule instead of offering a manual (billed) action.
 */
export function LatestReportCard() {
	const { colors } = useTheme();
	const router = useRouter();
	const latest = useLatestReport();

	if (latest.isPending) {
		return (
			<View style={{ paddingVertical: 24, alignItems: "center" }}>
				<ActivityIndicator color={colors.primary} />
			</View>
		);
	}

	if (!latest.data) {
		return (
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={copy.pendingTitle}
				onPress={() => router.push("/reports")}
				style={({ pressed }) => [
					styles.card,
					{ backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
				]}
			>
				<Icon name="sparkles" size={20} color={colors.primary} />
				<View style={{ flex: 1, gap: 2 }}>
					<Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
						{copy.pendingTitle}
					</Text>
					<Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
						{copy.pendingBody}
					</Text>
				</View>
				<Icon name="chevron-right" size={18} color={colors.textSecondary} />
			</Pressable>
		);
	}

	const report = latest.data;
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${formatPeriodTitle(report.period, report.periodKey)} ${report.headline}`}
			onPress={() =>
				router.push({
					pathname: "/reports/detail",
					params: { period: report.period, key: report.periodKey },
				})
			}
			style={({ pressed }) => [
				styles.card,
				{ backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
			]}
		>
			<Icon name="sparkles" size={20} color={colors.primary} />
			<View style={{ flex: 1, gap: 3 }}>
				<View style={styles.titleRow}>
					<Text style={{ color: colors.textSecondary, fontSize: 11 }}>
						{formatPeriodTitle(report.period, report.periodKey)}
					</Text>
					<View style={[styles.chip, { backgroundColor: colors.border }]}>
						<Text style={{ color: colors.text, fontSize: 10 }}>{report.moodLabel}</Text>
					</View>
				</View>
				<Text
					numberOfLines={2}
					style={{ color: colors.text, fontSize: 14, fontWeight: "600", lineHeight: 20 }}
				>
					{report.headline}
				</Text>
			</View>
			<Icon name="chevron-right" size={18} color={colors.textSecondary} />
		</Pressable>
	);
}

const styles = {
	card: {
		flexDirection: "row" as const,
		alignItems: "center" as const,
		gap: 12,
		borderRadius: 14,
		padding: 14,
	},
	titleRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
	chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
};
