import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { Card, dashboardStyles } from "@/features/dashboard/components";
import { ParseError, type ParseFailure } from "@/features/llm/chat";
import { formatCostYuan } from "@/features/llm-usage/pricing";
import { dayjs, formatPeriodTitle } from "@/lib/date";
import { resolveIconKey } from "@/lib/iconResolvers";
import { formatCentsWithSymbol } from "@/lib/money";
import { useTheme, withAlpha } from "@/theme";
import type { ReportAnalysis, ReportValue } from "../analysis-contract";
import { EmptyPeriodError } from "../generate";
import { useGenerateReport, useStoredReport } from "../hooks";
import { reportValueMeta, reportsText as copy } from "../labels";
import type { StoredReport } from "../repository";
import type { ReportSnapshot } from "../snapshot";

function failureLabel(failure: ParseFailure): string {
	switch (failure) {
		case "missing_key":
			return copy.missingKey;
		case "unauthorized":
			return copy.unauthorized;
		case "rate_limited":
			return copy.rateLimited;
		case "timeout":
			return copy.timeout;
		case "server":
			return copy.server;
		case "network":
			return copy.network;
		default:
			return copy.invalidResponse;
	}
}

function errorLabel(error: unknown): string {
	if (error instanceof EmptyPeriodError) return copy.emptyPeriod;
	if (error instanceof ParseError) return failureLabel(error.failure);
	return copy.failed;
}

/** Five-dot mood scale: the score is the only model-controlled value that affects layout. */
function MoodScale({ analysis }: { analysis: ReportAnalysis }) {
	const { colors } = useTheme();
	const { score, label, narrative } = analysis.mood;
	return (
		<View style={styles.moodCard}>
			<View style={dashboardStyles.between}>
				<Text style={{ color: colors.textSecondary, fontSize: 12 }}>
					{copy.moodTitle}
				</Text>
				<View style={styles.dots}>
					{Array.from({ length: 5 }, (_, index) => {
						const filled = index < score;
						return (
							<View
								key={index}
								style={{
									width: 8,
									height: 8,
									borderRadius: 4,
									backgroundColor: filled ? colors.primary : colors.border,
								}}
							/>
						);
					})}
				</View>
			</View>
			<View style={styles.moodHeadline}>
				<Text style={{ color: colors.primary, fontSize: 20, fontWeight: "700" }}>
					{label}
				</Text>
				<Text style={{ color: colors.textSecondary, fontSize: 12 }}>
					{copy.moodScale[score - 1] ?? ""}
				</Text>
			</View>
			<Text style={{ color: colors.text, fontSize: 13, lineHeight: 21 }}>
				{narrative}
			</Text>
		</View>
	);
}

/** Two-column "原来如此" metrics; the value string is model text, never parsed for layout. */
function DataPointGrid({ points }: { points: ReportAnalysis["dataPoints"] }) {
	const { colors } = useTheme();
	return (
		<View style={styles.grid}>
			{points.map((point, index) => (
				<View
					key={`${point.label}-${index}`}
					style={[
						styles.gridCell,
						{ backgroundColor: colors.card, borderColor: colors.border },
					]}
				>
					<Text style={{ color: colors.textSecondary, fontSize: 11 }}>
						{point.label}
					</Text>
					<Text
						numberOfLines={1}
						adjustsFontSizeToFit
						style={{
							color: colors.text,
							fontSize: 18,
							fontWeight: "700",
							fontVariant: ["tabular-nums"],
						}}
					>
						{point.value}
					</Text>
					<Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 16 }}>
						{point.note}
					</Text>
				</View>
			))}
		</View>
	);
}

function ValueCard({ value }: { value: ReportValue }) {
	const { colors } = useTheme();
	const meta = reportValueMeta[value.id];
	const toneColor = colors[meta.tone];
	return (
		<View
			style={[
				styles.valueCard,
				{ backgroundColor: colors.card, borderColor: withAlpha(toneColor, 0.35) },
			]}
		>
			<View style={styles.valueHead}>
				<View
					style={[
						styles.valueIcon,
						{ backgroundColor: withAlpha(toneColor, 0.14) },
					]}
				>
					<Icon
						name={resolveIconKey(meta.icon, "category")}
						size={16}
						color={toneColor}
					/>
				</View>
				<Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 }}>
					{value.label}
				</Text>
				<Text style={{ color: toneColor, fontSize: 11 }}>{meta.label}</Text>
			</View>
			<Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 19 }}>
				{value.narrative}
			</Text>
		</View>
	);
}

/** Category stories are matched back to the snapshot so they keep the user's own colors/icons. */
function CategoryStories({
	stories,
	categories,
}: {
	stories: ReportAnalysis["categoryStories"];
	categories: ReportSnapshot["categories"];
}) {
	const { colors } = useTheme();
	if (stories.length === 0) return null;
	return (
		<View style={{ gap: 10 }}>
			{stories.map((story, index) => {
				const category = categories.find((row) => row.name === story.category);
				const color = category?.color ?? colors.primary;
				const icon = resolveIconKey(category?.icon ?? "package", "category");
				return (
					<View
						key={`${story.category}-${index}`}
						style={[styles.storyRow, { backgroundColor: colors.card }]}
					>
						<View style={[styles.storyIcon, { backgroundColor: withAlpha(color, 0.14) }]}>
							<Icon name={icon} size={16} color={color} />
						</View>
						<View style={{ flex: 1, gap: 2 }}>
							<View style={dashboardStyles.between}>
								<Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
									{story.category}
								</Text>
								<Text style={{ color, fontSize: 11, fontWeight: "600" }}>
									{story.emotion}
								</Text>
							</View>
							<Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
								{story.note}
							</Text>
							{category && (
								<Text style={{ color: colors.textSecondary, fontSize: 11 }}>
									{formatCentsWithSymbol(category.totalCents)} · {category.pct}%
								</Text>
							)}
						</View>
					</View>
				);
			})}
		</View>
	);
}

function SuggestionList({ suggestions }: { suggestions: ReportAnalysis["suggestions"] }) {
	const { colors } = useTheme();
	return (
		<View style={{ gap: 10 }}>
			{suggestions.map((item, index) => (
				<View
					key={`${item.title}-${index}`}
					style={[styles.suggestion, { backgroundColor: colors.card }]}
				>
					<View style={[styles.suggestionIndex, { backgroundColor: colors.primary }]}>
						<Text style={{ color: colors.onPrimary, fontSize: 12, fontWeight: "700" }}>
							{index + 1}
						</Text>
					</View>
					<View style={{ flex: 1, gap: 4 }}>
						<Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
							{item.title}
						</Text>
						<Text style={{ color: colors.text, fontSize: 12, lineHeight: 19 }}>
							{item.action}
						</Text>
						<View style={styles.suggestionMeta}>
							<Text style={{ color: colors.primary, fontSize: 11 }}>
								{copy.targetLabel}：{item.target}
							</Text>
							<Text style={{ color: colors.income, fontSize: 11 }}>
								{copy.impactLabel}：{item.impact}
							</Text>
						</View>
					</View>
				</View>
			))}
		</View>
	);
}

/** Pure renderer for one stored report; screens own data loading and regeneration. */
export function ReportDetail({
	report,
	onRegenerate,
	regenerating,
}: {
	report: StoredReport;
	onRegenerate?: () => void;
	regenerating?: boolean;
}) {
	const { colors } = useTheme();
	const { analysis, snapshot } = report;
	return (
		<View style={{ gap: 16 }}>
			<View style={[styles.hero, { backgroundColor: colors.card }]}>
				<Text style={{ color: colors.textSecondary, fontSize: 12 }}>
					{formatPeriodTitle(report.period, report.periodKey)}
				</Text>
				<Text style={{ color: colors.text, fontSize: 22, fontWeight: "700", lineHeight: 30 }}>
					{analysis.headline}
				</Text>
				<View style={styles.heroNumbers}>
					<Text style={{ color: colors.expense, fontSize: 13, fontWeight: "600" }}>
						{copy.totalExpense} {formatCentsWithSymbol(snapshot.totals.expenseCents)}
					</Text>
					<Text style={{ color: colors.income, fontSize: 13 }}>
						{copy.net} {formatCentsWithSymbol(snapshot.totals.netCents)}
					</Text>
				</View>
			</View>

			<MoodScale analysis={analysis} />

			<Card title={copy.dataTitle}>
				<DataPointGrid points={analysis.dataPoints} />
			</Card>

			<Card title={copy.valuesTitle}>
				<View style={{ gap: 10 }}>
					{analysis.values.map((value) => (
						<ValueCard key={value.id} value={value} />
					))}
				</View>
			</Card>

			{analysis.categoryStories.length > 0 && (
				<Card title={copy.categoryTitle}>
					<CategoryStories
						stories={analysis.categoryStories}
						categories={snapshot.categories}
					/>
				</Card>
			)}

			<Card title={copy.suggestionsTitle}>
				<SuggestionList suggestions={analysis.suggestions} />
				{analysis.savingPotentialYuan > 0 && (
					<View style={[styles.saving, { backgroundColor: withAlpha(colors.income, 0.12) }]}>
						<Text style={{ color: colors.income, fontSize: 12 }}>
							{copy.savingPotential}
						</Text>
						<Text style={{ color: colors.income, fontSize: 18, fontWeight: "700" }}>
							¥{Math.round(analysis.savingPotentialYuan)}
						</Text>
					</View>
				)}
			</Card>

			<View style={{ gap: 4 }}>
				<Text style={{ color: colors.textSecondary, fontSize: 11 }}>
					{copy.generatedAt} {dayjs(report.generatedAt).format("YYYY-MM-DD HH:mm")} ·{" "}
					{copy.modelLabel} {report.model} · {copy.costLabel}{" "}
					{formatCostYuan(report.costMicros)}
				</Text>
				<Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 17 }}>
					{copy.privacy}
				</Text>
			</View>

			{onRegenerate &&
				(regenerating ? (
					<View style={styles.inline}>
						<ActivityIndicator color={colors.primary} />
						<Text style={{ color: colors.textSecondary, fontSize: 12 }}>
							{copy.generating}
						</Text>
					</View>
				) : (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={copy.regenerate}
						onPress={onRegenerate}
						style={({ pressed }) => [
							styles.regenerate,
							{ borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
						]}
					>
						<Icon name="rotate-ccw" size={14} color={colors.textSecondary} />
						<Text style={{ color: colors.text, fontSize: 13 }}>{copy.regenerate}</Text>
					</Pressable>
				))}
		</View>
	);
}

/**
 * Loads the persisted report for a fixed period. Viewing never regenerates: the stored row is the
 * source of truth, and regeneration stays an explicit, billed action.
 */
export function ReportDetailScreen({
	period,
	periodKey,
}: {
	period: StoredReport["period"];
	periodKey: string;
}) {
	const stored = useStoredReport({ period, key: periodKey });
	const generate = useGenerateReport();
	const { colors } = useTheme();
	const regenerating =
		generate.isPending &&
		generate.variables?.period === period &&
		generate.variables.key === periodKey;

	if (stored.isPending) {
		return (
			<View style={styles.stateBlock}>
				<ActivityIndicator color={colors.primary} />
			</View>
		);
	}
	if (stored.data) {
		return (
			<ScrollView
				style={{ backgroundColor: colors.background }}
				contentContainerStyle={[dashboardStyles.content, { paddingBottom: 40 }]}
			>
				<ReportDetail
					report={stored.data}
					regenerating={regenerating}
					onRegenerate={() => generate.mutate({ period, key: periodKey })}
				/>
			</ScrollView>
		);
	}
	return (
		<ScrollView
			style={{ backgroundColor: colors.background }}
			contentContainerStyle={[dashboardStyles.content, { paddingBottom: 40 }]}
		>
			<Card title={formatPeriodTitle(period, periodKey)}>
				<Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
					{copy.pendingTitle}
				</Text>
				<Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 19 }}>
					{copy.pendingBody}
				</Text>
				{generate.isError && (
					<Text style={{ color: colors.expense, fontSize: 12 }}>
						{errorLabel(generate.error)}
					</Text>
				)}
				{regenerating ? (
					<View style={styles.inline}>
						<ActivityIndicator color={colors.primary} />
						<Text style={{ color: colors.textSecondary, fontSize: 12 }}>
							{copy.generating}
						</Text>
					</View>
				) : (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={copy.generate}
						onPress={() => generate.mutate({ period, key: periodKey })}
						style={({ pressed }) => [
							styles.primaryButton,
							{ backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
						]}
					>
						<Text style={{ color: colors.onPrimary, fontSize: 14, fontWeight: "700" }}>
							{copy.generate}
						</Text>
					</Pressable>
				)}
			</Card>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	hero: { borderRadius: 16, padding: 16, gap: 8 },
	heroNumbers: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
	moodCard: { borderRadius: 16, padding: 16, gap: 8 },
	moodHeadline: { flexDirection: "row", alignItems: "baseline", gap: 8 },
	dots: { flexDirection: "row", gap: 4 },
	grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
	gridCell: {
		width: "47%",
		flexGrow: 1,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 12,
		gap: 3,
	},
	valueCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 6 },
	valueHead: { flexDirection: "row", alignItems: "center", gap: 8 },
	valueIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
	storyRow: { flexDirection: "row", gap: 10, borderRadius: 14, padding: 12, alignItems: "flex-start" },
	storyIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
	suggestion: { flexDirection: "row", gap: 10, borderRadius: 14, padding: 12, alignItems: "flex-start" },
	suggestionIndex: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
	suggestionMeta: { gap: 2 },
	saving: { marginTop: 12, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
	inline: { flexDirection: "row", alignItems: "center", gap: 8 },
	regenerate: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		paddingVertical: 12,
	},
	primaryButton: { alignItems: "center", justifyContent: "center", borderRadius: 12, paddingVertical: 12 },
	stateBlock: { paddingVertical: 48, alignItems: "center" },
});
