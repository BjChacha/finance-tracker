import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { useFloatingTabBarInset } from "@/components/navigation/floating-tab-bar";
import {
	axisLabel,
	CalendarHeat,
	CompareBarChart,
	dashboardChartLayout,
	DonutChart,
	HBarList,
	TrendLineChart,
	useCalendarHeatmap,
	useCategoryBreakdown,
	useCategoryRank,
	useMonthlyCompare,
	useNetWorthTrend,
	useTrend,
	type BreakdownType,
	type StatsRange,
	type TrendGranularity,
} from "@/features/stats";
import { zh } from "@/i18n/zh";
import { formatCents } from "@/lib/money";
import { dayjs, monthRange, todayKey, toMonthKey } from "@/lib/date";
import { useTheme, type AppTheme } from "@/theme";

type RangeMode = "month" | "quarter" | "year";

const RANGE_OPTIONS: { mode: RangeMode; label: string }[] = [
	{ mode: "month", label: zh.stats.rangeMonth },
	{ mode: "quarter", label: zh.stats.rangeQuarter },
	{ mode: "year", label: zh.stats.rangeYear },
];

/** quarterKey "YYYY-Qn" → 该自然季度的首末日 date_key */
function quarterRange(quarterKey: string): [string, string] {
	const [yearStr, qStr] = quarterKey.split("-Q");
	const year = Number(yearStr);
	const q = Number(qStr);
	const startMonth = (q - 1) * 3 + 1;
	const endMonth = q * 3;
	const start = dayjs(`${year}-${String(startMonth).padStart(2, "0")}-01`);
	const end = dayjs(`${year}-${String(endMonth).padStart(2, "0")}-01`).endOf("month");
	return [start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD")];
}

/** monthKey "YYYY-MM" → 当前所在自然季度 "YYYY-Qn" */
function quarterOf(monthKey: string): string {
	const year = Number(monthKey.slice(0, 4));
	const q = Math.ceil(Number(monthKey.slice(5, 7)) / 3);
	return `${year}-Q${q}`;
}

/** 季度键加减（跨年自动进位） */
function shiftQuarterKey(quarterKey: string, delta: number): string {
	const [yearStr, qStr] = quarterKey.split("-Q");
	let year = Number(yearStr);
	let q = Number(qStr) + delta;
	while (q > 4) {
		q -= 4;
		year += 1;
	}
	while (q < 1) {
		q += 4;
		year -= 1;
	}
	return `${year}-Q${q}`;
}

function Section({
	title,
	subtitle,
	right,
	children,
	theme,
}: {
	title?: string;
	subtitle?: string;
	right?: React.ReactNode;
	children: React.ReactNode;
	theme: AppTheme;
}) {
	return (
		<View style={[styles.card, { backgroundColor: theme.colors.card }]}>
			{title ? (
				<View style={styles.cardHeader}>
					<View style={styles.cardHeading}>
						<Text style={[styles.cardTitle, { color: theme.colors.text }]}>
							{title}
						</Text>
						{subtitle ? (
							<Text
								style={[
									styles.cardSubtitle,
									{ color: theme.colors.textSecondary },
								]}
							>
								{subtitle}
							</Text>
						) : null}
					</View>
					{right}
				</View>
			) : null}
			{children}
		</View>
	);
}

function Kpi({
	theme,
	label,
	value,
	valueColor,
	sub,
}: {
	theme: AppTheme;
	label: string;
	value: string;
	valueColor: string;
	sub?: string;
}) {
	return (
		<View style={[styles.kpiTile, { backgroundColor: theme.colors.card }]}>
			<Text style={[styles.kpiLabel, { color: theme.colors.textSecondary }]}>
				{label}
			</Text>
			<Text style={[styles.kpiValue, { color: valueColor }]} numberOfLines={1}>
				{value}
			</Text>
			{sub ? (
				<Text style={[styles.kpiSub, { color: theme.colors.textSecondary }]}>
					{sub}
				</Text>
			) : null}
		</View>
	);
}

export default function StatsScreen() {
	const theme = useTheme();
	const tabBarInset = useFloatingTabBarInset();
	const currentMonth = toMonthKey(todayKey());
	const currentQuarter = quarterOf(currentMonth);
	const currentYear = currentMonth.slice(0, 4);
	const [mode, setMode] = useState<RangeMode>("month");
	const [monthKey, setMonthKey] = useState(currentMonth);
	const [quarterKey, setQuarterKey] = useState(currentQuarter);
	const [yearKey, setYearKey] = useState(currentYear);
	const [heatMonth, setHeatMonth] = useState(currentMonth);
	const [txType, setTxType] = useState<BreakdownType>("expense");

	const range = useMemo<StatsRange>(() => {
		switch (mode) {
			case "month": {
				const [start, end] = monthRange(monthKey);
				return { start, end };
			}
			case "quarter": {
				const [start, end] = quarterRange(quarterKey);
				return { start, end };
			}
			case "year": {
				return { start: `${yearKey}-01-01`, end: `${yearKey}-12-31` };
			}
		}
	}, [mode, monthKey, quarterKey, yearKey]);

	const granularity: TrendGranularity =
		mode === "month" ? "day" : mode === "quarter" ? "week" : "month";

	const breakdown = useCategoryBreakdown(range, txType);
	const trendQuery = useTrend(granularity, range);
	const compare = useMonthlyCompare(6);
	const netWorth = useNetWorthTrend(6);
	const heatmap = useCalendarHeatmap(heatMonth);
	const rank = useCategoryRank(range, txType, 6);

	const selectMode = (m: RangeMode) => {
		setMode(m);
	};
	const selectType = (t: BreakdownType) => {
		setTxType(t);
	};
	const shiftMonth = (delta: number) => {
		setMonthKey(dayjs(`${monthKey}-01`).add(delta, "month").format("YYYY-MM"));
	};
	const shiftQuarter = (delta: number) => {
		setQuarterKey(shiftQuarterKey(quarterKey, delta));
	};
	const shiftYear = (delta: number) => {
		setYearKey(String(Number(yearKey) + delta));
	};
	const shiftHeatMonth = (delta: number) => {
		setHeatMonth(
			dayjs(`${heatMonth}-01`).add(delta, "month").format("YYYY-MM"),
		);
	};

	const donutData = (breakdown.data ?? []).map((s) => ({
		id: s.categoryId,
		label: s.name,
		value: s.total,
		color: s.color,
		icon: s.icon,
		pct: s.pct,
	}));
	const trendPoints = (trendQuery.data ?? []).map((p) => ({
		label: p.label,
		primary: p.expense,
		secondary: p.income,
	}));
	const compareList = compare.data ?? [];
	const compareCrossYear =
		compareList.length > 1 &&
		compareList[0].month.slice(0, 4) !==
			compareList[compareList.length - 1].month.slice(0, 4);
	const netWorthList = netWorth.data ?? [];
	const netWorthCrossYear =
		netWorthList.length > 1 &&
		netWorthList[0].month.slice(0, 4) !==
			netWorthList[netWorthList.length - 1].month.slice(0, 4);
	const netWorthPoints = netWorthList.map((p) => ({
		label: axisLabel(p.month, "month", netWorthCrossYear),
		primary: p.value,
	}));
	const breakdownRangeLabel =
		mode === "month"
			? dayjs(`${monthKey}-01`).format("YYYY年M月")
			: mode === "quarter"
				? `${quarterKey.slice(0, 4)}年第${quarterKey.slice(-1)}季度`
				: `${yearKey}年`;
	const breakdownSubtitle = [breakdownRangeLabel, zh.tx[txType]].join(" · ");

	// KPI：储蓄率 / 日均支出 / 当前类型下最大分类（均复用已取数据，无新增查询）
	const trendList = trendQuery.data ?? [];
	const totIncome = trendList.reduce((s, p) => s + p.income, 0);
	const totExpense = trendList.reduce((s, p) => s + p.expense, 0);
	const savings =
		totIncome > 0
			? Math.round(((totIncome - totExpense) / totIncome) * 100)
			: null;
	const periodDays = Math.max(
		dayjs(range.end).diff(dayjs(range.start), "day") + 1,
		1,
	);
	const avgDaily = Math.round(totExpense / periodDays);
	const topCat = rank.data?.[0] ?? null;

	const segActive = { backgroundColor: theme.colors.primary };
	const segText = (active: boolean) => ({
		color: active ? theme.colors.onPrimary : theme.colors.textSecondary,
		fontSize: 13,
	});

	return (
		<ScrollView
			style={{ backgroundColor: theme.colors.background }}
			contentContainerStyle={[styles.content, { paddingBottom: tabBarInset }]}
		>
			{/* 时间范围 */}
			<View style={[styles.segment, { backgroundColor: theme.colors.card }]}>
				{RANGE_OPTIONS.map((opt) => (
					<Pressable
						key={opt.mode}
						style={[styles.segmentItem, mode === opt.mode && segActive]}
						onPress={() => selectMode(opt.mode)}
					>
						<Text style={segText(mode === opt.mode)}>{opt.label}</Text>
					</Pressable>
				))}
			</View>

			{/* 当前周期切换：本月/本季/今年 均可前后翻页 */}
			{mode === "month" ? (
				<View style={styles.monthSwitch}>
						<Pressable onPress={() => shiftMonth(-1)} hitSlop={8}>
						<Icon
							name="chevron-left"
							size={22}
							color={theme.colors.primary}
							style={styles.monthArrow}
						/>
						</Pressable>
						<Text style={[styles.monthText, { color: theme.colors.text }]}>
						{dayjs(`${monthKey}-01`).format("YYYY年M月")}
						</Text>
						<Pressable
						onPress={() => shiftMonth(1)}
						hitSlop={8}
						disabled={monthKey >= currentMonth}
						>
						<Icon
							name="chevron-right"
							size={22}
							color={
								monthKey >= currentMonth
									? theme.colors.border
									: theme.colors.primary
							}
							style={styles.monthArrow}
						/>
						</Pressable>
				</View>
			) : mode === "quarter" ? (
				<View style={styles.monthSwitch}>
						<Pressable onPress={() => shiftQuarter(-1)} hitSlop={8}>
						<Icon
							name="chevron-left"
							size={22}
							color={theme.colors.primary}
							style={styles.monthArrow}
						/>
						</Pressable>
						<Text style={[styles.monthText, { color: theme.colors.text }]}>
						{`${quarterKey.slice(0, 4)}年第${quarterKey.slice(-1)}季度`}
						</Text>
						<Pressable
						onPress={() => shiftQuarter(1)}
						hitSlop={8}
						disabled={quarterKey >= currentQuarter}
						>
						<Icon
							name="chevron-right"
							size={22}
							color={
								quarterKey >= currentQuarter
									? theme.colors.border
									: theme.colors.primary
							}
							style={styles.monthArrow}
						/>
						</Pressable>
				</View>
			) : (
				<View style={styles.monthSwitch}>
						<Pressable onPress={() => shiftYear(-1)} hitSlop={8}>
						<Icon
							name="chevron-left"
							size={22}
							color={theme.colors.primary}
							style={styles.monthArrow}
						/>
						</Pressable>
						<Text style={[styles.monthText, { color: theme.colors.text }]}>
						{`${yearKey}年`}
						</Text>
						<Pressable
						onPress={() => shiftYear(1)}
						hitSlop={8}
						disabled={yearKey >= currentYear}
						>
						<Icon
							name="chevron-right"
							size={22}
							color={
								yearKey >= currentYear
									? theme.colors.border
									: theme.colors.primary
							}
							style={styles.monthArrow}
						/>
						</Pressable>
				</View>
			)}

			{/* 支出/收入切换 */}
			<View style={[styles.segment, { backgroundColor: theme.colors.card }]}>
				{(["expense", "income"] as const).map((t) => (
					<Pressable
						key={t}
						style={[styles.segmentItem, txType === t && segActive]}
						onPress={() => selectType(t)}
					>
						<Text style={segText(txType === t)}>{zh.tx[t]}</Text>
					</Pressable>
				))}
			</View>

			{/* KPI 概览 */}
			<View style={styles.kpiRow}>
				<Kpi
					theme={theme}
					label={zh.dashboard.kpiSavings}
					value={savings === null ? "—" : `${savings}%`}
					valueColor={
						(savings ?? 0) >= 0 ? theme.colors.income : theme.colors.expense
					}
				/>
				<Kpi
					theme={theme}
					label={zh.dashboard.kpiAvgDaily}
					value={formatCents(avgDaily)}
					valueColor={theme.colors.expense}
				/>
				<Kpi
					theme={theme}
					label={`最大${zh.tx[txType]}`}
					value={topCat ? topCat.name : zh.dashboard.kpiNoExpense}
					sub={topCat ? `${topCat.pct}%` : undefined}
					valueColor={theme.colors.text}
				/>
			</View>

			{/* 分类占比（点击切片高亮并展示具体值，含其他分类） */}
			<Section
				title={zh.stats.breakdownTitle}
				subtitle={breakdownSubtitle}
				theme={theme}
			>
				<DonutChart
					data={donutData}
					centerLabel={
						txType === "expense" ? zh.stats.totalExpense : zh.stats.totalIncome
					}
				/>
			</Section>

			{/* 收支趋势 */}
			<Section title={zh.stats.trendTitle} theme={theme}>
				<TrendLineChart
					points={trendPoints}
					height={dashboardChartLayout.plotHeight}
					primaryColor={theme.colors.expense}
					primaryLabel={zh.tx.expense}
					secondaryColor={theme.colors.income}
					secondaryLabel={zh.tx.income}
				/>
			</Section>

			{/* 月度对比 */}
			<Section title={zh.stats.compareTitle} theme={theme}>
				<CompareBarChart
					data={compareList.map((m) => ({
						label: axisLabel(m.month, "month", compareCrossYear),
						income: m.income,
						expense: m.expense,
					}))}
					incomeLabel={zh.tx.income}
					expenseLabel={zh.tx.expense}
					height={dashboardChartLayout.plotHeight}
				/>
			</Section>

			{/* 净资产趋势 */}
			<Section title={zh.stats.netWorthTitle} theme={theme}>
				<TrendLineChart
					points={netWorthPoints}
					height={dashboardChartLayout.plotHeight}
					primaryColor={theme.colors.primary}
					primaryLabel={zh.stats.netWorth}
				/>
			</Section>

			{/* 消费日历（标题 + 副标题样式的月份切换，独立于范围选择；相邻月份已预加载） */}
			<Section title={zh.stats.heatmapTitle} theme={theme}>
				<View style={styles.heatSwitch}>
					<Pressable onPress={() => shiftHeatMonth(-1)} hitSlop={8}>
						<Icon
							name="chevron-left"
							size={20}
							color={theme.colors.primary}
							style={styles.heatArrow}
						/>
					</Pressable>
					<Text style={[styles.heatText, { color: theme.colors.text }]}>
						{dayjs(`${heatMonth}-01`).format("YYYY年M月")}
					</Text>
					<Pressable
						onPress={() => shiftHeatMonth(1)}
						hitSlop={8}
						disabled={heatMonth >= currentMonth}
					>
						<Icon
							name="chevron-right"
							size={20}
							color={
								heatMonth >= currentMonth
									? theme.colors.border
									: theme.colors.primary
							}
							style={styles.heatArrow}
						/>
					</Pressable>
				</View>
				<CalendarHeat monthKey={heatMonth} cells={heatmap.data ?? []} />
			</Section>

			{/* 分类排行 */}
			<Section title={zh.stats.rankTitle} theme={theme}>
				<HBarList
					items={(rank.data ?? []).map((r) => ({
						id: r.categoryId,
						name: r.name,
						icon: r.icon,
						color: r.color,
						total: r.total,
						pct: r.pct,
					}))}
				/>
			</Section>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	content: { padding: 16, gap: dashboardChartLayout.cardGap },
	segment: { flexDirection: "row", borderRadius: 10, padding: 4 },
	segmentItem: {
		flex: 1,
		alignItems: "center",
		paddingVertical: 8,
		borderRadius: 8,
	},
	monthSwitch: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 24,
	},
	monthArrow: { paddingHorizontal: 8 },
	monthText: { fontSize: 15, fontWeight: "600" },
	heatSwitch: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 16,
		marginBottom: 12,
	},
	heatArrow: { paddingHorizontal: 2 },
	heatText: { fontSize: 13, fontWeight: "600" },
	card: { borderRadius: 12, padding: dashboardChartLayout.cardPadding },
	kpiRow: { flexDirection: "row", gap: 8 },
	kpiTile: { flex: 1, borderRadius: 12, padding: 12 },
	kpiLabel: { fontSize: 12 },
	kpiValue: {
		fontSize: 16,
		fontWeight: "600",
		marginTop: 4,
		fontVariant: ["tabular-nums"],
	},
	kpiSub: { fontSize: 12, marginTop: 2 },
	cardHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		marginBottom: dashboardChartLayout.cardHeaderGap,
	},
	cardHeading: { flex: 1 },
	cardTitle: { fontSize: 15, fontWeight: "600" },
	cardSubtitle: { fontSize: 12, marginTop: 3 },
});
