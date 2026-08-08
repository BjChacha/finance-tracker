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
	useTransactionDateRange,
	useTrend,
	type BreakdownType,
	type StatsRange,
	type TrendGranularity,
} from "@/features/stats";
import { zh } from "@/i18n/zh";
import { formatCents } from "@/lib/money";
import { dayjs, monthRange, todayKey, toMonthKey } from "@/lib/date";
import { useTheme, type AppTheme } from "@/theme";

type RangeMode = "week" | "month" | "3m" | "6m" | "year";

/** 不选中任何选项 = 全部时间（默认） */
const RANGE_OPTIONS: { mode: RangeMode; label: string }[] = [
	{ mode: "week", label: zh.stats.rangeWeek },
	{ mode: "month", label: zh.stats.rangeMonth },
	{ mode: "3m", label: zh.stats.range3m },
	{ mode: "6m", label: zh.stats.range6m },
	{ mode: "year", label: zh.stats.rangeYear },
];

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
	const [mode, setMode] = useState<RangeMode | null>(null);
	const [monthKey, setMonthKey] = useState(currentMonth);
	const [heatMonth, setHeatMonth] = useState(currentMonth);
	const [txType, setTxType] = useState<BreakdownType>("expense");

	const dateRangeQuery = useTransactionDateRange();

	const range = useMemo<StatsRange>(() => {
		if (mode === null) {
			// 全部时间：基于真实数据范围；未加载时用当月兜底，加载后自动重算
			return (
				dateRangeQuery.data ?? {
					start: monthRange(currentMonth)[0],
					end: monthRange(currentMonth)[1],
				}
			);
		}
		switch (mode) {
			case "week": {
				// zh-cn locale：周一为一周起点
				const start = dayjs().startOf("week").format("YYYY-MM-DD");
				const end = dayjs().endOf("week").format("YYYY-MM-DD");
				return { start, end };
			}
			case "month": {
				const [start, end] = monthRange(monthKey);
				return { start, end };
			}
			case "3m":
			case "6m": {
				const back = mode === "3m" ? 2 : 5;
				const start = dayjs(`${currentMonth}-01`)
					.subtract(back, "month")
					.format("YYYY-MM-DD");
				return { start, end: monthRange(currentMonth)[1] };
			}
			case "year": {
				const year = currentMonth.slice(0, 4);
				return { start: `${year}-01-01`, end: `${year}-12-31` };
			}
		}
	}, [mode, monthKey, currentMonth, dateRangeQuery.data]);

	const granularity: TrendGranularity = useMemo(() => {
		if (mode === "week" || mode === "month") return "day";
		if (mode === "3m") return "week";
		// 全部时间（mode=null）：跨度超 24 个月时按年，避免点过密
		if (mode === null) {
			const months = dayjs(range.end).diff(dayjs(range.start), "month") + 1;
			return months > 24 ? "year" : "month";
		}
		return "month";
	}, [mode, range]);

	const breakdown = useCategoryBreakdown(range, txType);
	const trendQuery = useTrend(granularity, range);
	const compare = useMonthlyCompare(6);
	const netWorth = useNetWorthTrend(6);
	const heatmap = useCalendarHeatmap(heatMonth);
	const rank = useCategoryRank(range, txType, 6);

	const selectMode = (m: RangeMode) => {
		// 再次点击已选中项 → 取消选择，回到“全部时间”
		setMode((prev) => (prev === m ? null : m));
		setMonthKey(currentMonth);
	};
	const selectType = (t: BreakdownType) => {
		setTxType(t);
	};
	const shiftMonth = (delta: number) => {
		setMonthKey(dayjs(`${monthKey}-01`).add(delta, "month").format("YYYY-MM"));
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
		mode === null
			? zh.stats.rangeAll
			: mode === "month"
				? dayjs(`${monthKey}-01`).format("YYYY年M月")
				: (RANGE_OPTIONS.find((option) => option.mode === mode)?.label ??
					zh.stats.rangeAll);
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

			{/* 本月模式下的月份切换 */}
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
			) : null}

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
