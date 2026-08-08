import { useRouter, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { useFloatingTabBarInset } from "@/components/navigation/floating-tab-bar";
import { useTransactionSummary } from "@/features/stats";
import { zh } from "@/i18n/zh";
import { dayjs } from "@/lib/date";
import { formatCentsWithSymbol } from "@/lib/money";
import { useTheme } from "@/theme";

type Entry = { icon: IconName; label: string; href: Href | null };
type Group = { title: string; items: Entry[] };

/** Groups an integer with thousands separators (Hermes lacks full Intl grouping). */
function groupDigits(n: number): string {
	return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Top-of-page overview: first booking date, total entries, tracked amount. */
function ProfileSummaryCard() {
	const { colors } = useTheme();
	const summary = useTransactionSummary();
	const data = summary.data;
	const stats = [
		{
			label: zh.profile.summarySince,
			value: data?.firstDate ? dayjs(data.firstDate).format("YYYY.MM.DD") : "—",
		},
		{
			label: zh.profile.summaryCount,
			value: data ? groupDigits(data.count) : "—",
		},
		{
			label: zh.profile.summaryTracked,
			value: data ? formatCentsWithSymbol(data.trackedCents) : "—",
		},
	];
	return (
		<View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
			{stats.map((stat, index) => (
				<View
					key={stat.label}
					style={[
						styles.summaryCell,
						index > 0 && {
							borderLeftWidth: StyleSheet.hairlineWidth,
							borderLeftColor: colors.border,
						},
					]}
				>
					<Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
						{stat.label}
					</Text>
					<Text
						style={[styles.summaryValue, { color: colors.text }]}
						numberOfLines={1}
						adjustsFontSizeToFit
						minimumFontScale={0.6}
					>
						{stat.value}
					</Text>
				</View>
			))}
		</View>
	);
}

export default function ProfileScreen() {
	const { colors } = useTheme();
	const router = useRouter();
	const tabBarInset = useFloatingTabBarInset();

	const groups: Group[] = [
		{
			title: zh.settings.groups.appearance,
			items: [
				{ icon: "palette", label: zh.appearance.title, href: "/appearance" },
			],
		},
		{
			title: zh.settings.groups.accountsCats,
			items: [
				{ icon: "credit-card", label: zh.profile.accounts, href: "/accounts" },
				{ icon: "tag", label: zh.profile.categories, href: "/categories" },
				{ icon: "briefcase", label: zh.profile.projects, href: "/projects" },
				{ icon: "coins", label: zh.profile.rates, href: "/rates" },
			],
		},
		{
			title: zh.settings.groups.data,
			items: [
				{ icon: "target", label: zh.budgets.title, href: "/budgets" },
				{ icon: "repeat", label: zh.profile.recurring, href: "/recurring" },
			],
		},
		{
			title: zh.settings.groups.importExport,
			items: [
				{ icon: "cloud", label: zh.profile.backup, href: "/backup" },
				{ icon: "download", label: zh.profile.import, href: "/import" },
			],
		},
	];

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: colors.background }}
			contentContainerStyle={{
				padding: 16,
				gap: 20,
				paddingBottom: tabBarInset,
			}}
		>
			<ProfileSummaryCard />
			{groups.map((g) => (
				<View key={g.title}>
					<Text style={[styles.groupTitle, { color: colors.textSecondary }]}>
						{g.title}
					</Text>
					<View style={[styles.card, { backgroundColor: colors.card }]}>
						{g.items.map((entry, i) => {
							const disabled = entry.href === null;
							return (
								<Pressable
									key={entry.label}
									style={[
										styles.row,
										i > 0 && {
											borderTopWidth: StyleSheet.hairlineWidth,
											borderTopColor: colors.border,
										},
										disabled && { opacity: 0.4 },
									]}
									disabled={disabled}
									onPress={() => entry.href && router.push(entry.href)}
								>
									<Icon name={entry.icon} size={20} color={colors.primary} />
									<Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>
										{entry.label}
									</Text>
									{disabled ? (
										<Text style={{ color: colors.textSecondary, fontSize: 12 }}>
											{zh.profile.comingSoon}
										</Text>
									) : (
										<Icon
											name="chevron-right"
											size={18}
											color={colors.textSecondary}
										/>
									)}
								</Pressable>
							);
						})}
					</View>
				</View>
			))}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	groupTitle: {
		fontSize: 13,
		fontWeight: "600",
		marginBottom: 8,
		marginLeft: 4,
	},
	card: { borderRadius: 12, overflow: "hidden" },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingVertical: 15,
	},
	summaryCard: { flexDirection: "row", borderRadius: 12, paddingVertical: 14 },
	summaryCell: { flex: 1, alignItems: "center", gap: 4, paddingHorizontal: 6 },
	summaryLabel: { fontSize: 11 },
	summaryValue: {
		fontSize: 14,
		fontWeight: "600",
		fontVariant: ["tabular-nums"],
	},
});
