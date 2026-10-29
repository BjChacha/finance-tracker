import { useRouter, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { useFloatingTabBarInset } from "@/components/navigation/floating-tab-bar";
import { LLMUsageCard } from "@/features/llm-usage/usage-card";
import { useTransactionSummary } from "@/features/stats";
import { useAllTimeSummary } from "@/features/transactions";
import {
	deriveUpdateStatus,
	dismissUpdate,
	isUpdateDismissed,
	useLatestRelease,
} from "@/features/update";
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

/** 顶部记录概览：起始日 / 笔数 + 全部时间收入 / 支出 / 结余（原流水页签的合计看板迁到此） */
function ProfileSummaryCard() {
	const { colors } = useTheme();
	const summary = useTransactionSummary();
	const totals = useAllTimeSummary();
	const data = summary.data;
	const money = totals.data;
	const moneyCells = [
		{
			label: zh.profile.summaryIncome,
			value: money ? formatCentsWithSymbol(money.income) : "—",
			color: colors.income,
		},
		{
			label: zh.profile.summaryExpense,
			value: money ? formatCentsWithSymbol(money.expense) : "—",
			color: colors.expense,
		},
		{
			label: zh.profile.summaryBalance,
			value: money
				? formatCentsWithSymbol(money.income - money.expense)
				: "—",
			color: colors.text,
		},
	];
	return (
		<View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
			<View style={styles.summaryMetaRow}>
				<Text style={[styles.summaryMeta, { color: colors.textSecondary }]}>
					{zh.profile.summarySince}{" "}
					{data?.firstDate
						? dayjs(data.firstDate).format("YYYY.MM.DD")
						: "—"}
				</Text>
				<Text style={[styles.summaryMeta, { color: colors.textSecondary }]}>
					{zh.profile.summaryCount} {data ? groupDigits(data.count) : "—"}
				</Text>
			</View>
			<View style={styles.summaryRow}>
				{moneyCells.map((cell, index) => (
					<View
						key={cell.label}
						style={[
							styles.summaryCell,
							index > 0 && {
								borderLeftWidth: StyleSheet.hairlineWidth,
								borderLeftColor: colors.border,
							},
						]}
					>
						<Text
							style={[styles.summaryLabel, { color: colors.textSecondary }]}
						>
							{cell.label}
						</Text>
						<Text
							style={[
								styles.summaryValue,
								{ color: cell.color, fontSize: 15 },
							]}
							numberOfLines={1}
							adjustsFontSizeToFit
							minimumFontScale={0.6}
						>
							{cell.value}
						</Text>
					</View>
				))}
			</View>
		</View>
	);
}

/** 新版本提醒卡片：启动检查发现新版且未被忽略时显示在页顶，点击进更新页。 */
function UpdateCard() {
	const { colors } = useTheme();
	const router = useRouter();
	const status = deriveUpdateStatus(useLatestRelease());
	// 本地 visible 态：点「忽略」当次渲染立即隐藏，模块级标记跨页面生效
	const [hidden, setHidden] = useState(false);

	if (status.state !== "available") return null;
	const { release } = status;
	if (isUpdateDismissed(release.version) || hidden) return null;

	return (
		<View style={[styles.updateCard, { backgroundColor: colors.card }]}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={zh.update.foundTitle(release.version)}
				style={styles.updateMain}
				onPress={() => router.push("/update")}
			>
				<Icon name="sparkles" size={20} color={colors.primary} />
				<View style={{ flex: 1 }}>
					<Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
						{zh.update.foundTitle(release.version)}
					</Text>
					<Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
						{zh.update.cardDesc}
					</Text>
				</View>
				<Icon name="chevron-right" size={18} color={colors.textSecondary} />
			</Pressable>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={zh.common.close}
				hitSlop={8}
				onPress={() => {
					dismissUpdate(release.version);
				setHidden(true);
				}}
				style={styles.updateClose}
			>
				<Icon name="x" size={16} color={colors.textSecondary} />
			</Pressable>
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
		{
			title: zh.settings.groups.about,
			items: [
				{ icon: "rotate-ccw", label: zh.profile.update, href: "/update" },
			],
		},
	];

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: colors.background }}
			contentContainerStyle={{
				padding: 16,
				gap: 20,
				paddingBottom: tabBarInset + 80,
			}}
		>
			<ProfileSummaryCard />
			<UpdateCard />
			<LLMUsageCard />
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
									accessibilityRole="button"
									accessibilityLabel={entry.label}
									style={({ pressed }) => [
										styles.row,
										{ backgroundColor: pressed ? colors.background : colors.card },
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
	summaryCard: {
		borderRadius: 12,
		paddingVertical: 14,
		paddingHorizontal: 8,
		gap: 10,
	},
	summaryMetaRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingHorizontal: 8,
	},
	summaryMeta: { fontSize: 11, fontVariant: ["tabular-nums"] },
	summaryRow: { flexDirection: "row" },
	updateCard: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 12,
		marginBottom: 0,
	},
	updateMain: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	updateClose: { paddingVertical: 14, paddingRight: 12 },
	summaryCell: { flex: 1, alignItems: "center", gap: 4, paddingHorizontal: 6 },
	summaryLabel: { fontSize: 11 },
	summaryValue: {
		fontWeight: "600",
		fontVariant: ["tabular-nums"],
	},
});
