import { useCallback, useEffect, useMemo, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { G, Polyline, Rect, Svg, Text as SvgText } from "react-native-svg";
import {
	formatAdaptiveCentsWithSymbol,
	formatCentsWithSymbol,
} from "@/lib/money";
import { useTheme } from "@/theme";
import { ChartEmpty } from "./ChartEmpty";
import { buildDonutSlices, type DonutSlice } from "./donut-data";
import {
	DONUT_CHART_HEIGHT,
	DONUT_INNER_RADIUS,
	DONUT_OUTER_RADIUS,
	DONUT_START_ANGLE,
	layoutDonutLabels,
} from "./donut-layout";

export type { DonutSlice } from "./donut-data";

type Props = {
	data: DonutSlice[];
	/** Label displayed in the donut center when no slice is selected. */
	centerLabel: string;
};

const CENTER_CONTENT_WIDTH = DONUT_INNER_RADIUS * 2 - 8;

/** Render category shares with deterministic external labels and leader lines. */
export function DonutChart({ data, centerLabel }: Props) {
	const theme = useTheme();
	const [chartWidth, setChartWidth] = useState(0);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const total = data.reduce((sum, slice) => sum + slice.value, 0);
	const hasData = data.length > 0 && total > 0;
	const slices = useMemo(
		() => buildDonutSlices(data, theme.colors.textSecondary),
		[data, theme.colors.textSecondary],
	);
	// Drop a stale selection when the slice set changes (type/range switch).
	useEffect(() => {
		if (selectedId && !slices.some((slice) => slice.id === selectedId)) {
			setSelectedId(null);
		}
	}, [selectedId, slices]);
	const labels = useMemo(
		() =>
			chartWidth > 0
				? layoutDonutLabels(slices, {
						width: chartWidth,
						height: DONUT_CHART_HEIGHT,
					})
				: [],
		[chartWidth, slices],
	);
	const select = useCallback((id: string) => {
		setSelectedId((current) => (current === id ? null : id));
	}, []);
	const pieData = useMemo(
		() =>
			slices.map((slice) => ({
				value: slice.value,
				color:
					selectedId && selectedId !== slice.id
						? theme.colors.border
						: slice.color,
				onPress: () => select(slice.id),
			})),
		[select, selectedId, slices, theme.colors.border],
	);
	const selectedSlice = selectedId
		? (slices.find((slice) => slice.id === selectedId) ?? null)
		: null;
	const exactTotal = formatCentsWithSymbol(total);
	const displayTotal = formatAdaptiveCentsWithSymbol(total);
	const accessibilityLabel = useMemo(
		() =>
			[
				`${centerLabel} ${exactTotal}`,
				...slices.map((slice) => `${slice.label} ${slice.pct}%`),
			].join(", "),
		[centerLabel, exactTotal, slices],
	);

	const handleLayout = useCallback((event: LayoutChangeEvent) => {
		const nextWidth = Math.floor(event.nativeEvent.layout.width);
		setChartWidth((current) => (current === nextWidth ? current : nextWidth));
	}, []);

	if (!hasData) return <ChartEmpty />;

	return (
		<View
			accessible
			accessibilityRole="image"
			accessibilityLabel={accessibilityLabel}
			onLayout={handleLayout}
			style={styles.wrap}
		>
			{chartWidth > 0 ? (
				<>
					<View
						style={[
							styles.pie,
							{
								left: chartWidth / 2 - DONUT_OUTER_RADIUS,
								top: DONUT_CHART_HEIGHT / 2 - DONUT_OUTER_RADIUS,
							},
						]}
					>
						<PieChart
							data={pieData}
							donut
							radius={DONUT_OUTER_RADIUS}
							innerRadius={DONUT_INNER_RADIUS}
							initialAngle={DONUT_START_ANGLE}
							extraRadius={0}
							paddingHorizontal={0}
							paddingVertical={0}
							innerCircleColor={theme.colors.card}
							centerLabelComponent={() => (
								<View style={styles.center}>
									<Text
										style={[
											styles.centerLabel,
											{ color: theme.colors.textSecondary },
										]}
										numberOfLines={1}
									>
										{selectedSlice ? selectedSlice.label : centerLabel}
									</Text>
									<Text
										accessibilityLabel={
											selectedSlice
												? formatCentsWithSymbol(selectedSlice.value)
												: exactTotal
										}
										numberOfLines={1}
										adjustsFontSizeToFit
										minimumFontScale={0.72}
										style={[styles.centerValue, { color: theme.colors.text }]}
									>
										{selectedSlice
											? formatCentsWithSymbol(selectedSlice.value)
											: displayTotal}
									</Text>
									{selectedSlice ? (
										<Text
											style={[
												styles.centerSub,
												{ color: theme.colors.textSecondary },
											]}
										>
											{selectedSlice.pct}%
										</Text>
									) : null}
								</View>
							)}
						/>
					</View>
					<Svg
						width={chartWidth}
						height={DONUT_CHART_HEIGHT}
						pointerEvents="box-none"
						style={StyleSheet.absoluteFill}
					>
						{labels.map((label) => {
							const points = label.linePoints
								.map((point) => `${point.x},${point.y}`)
								.join(" ");
							return (
								<G key={label.id}>
									<Polyline
										points={points}
										fill="none"
										stroke={theme.colors.textSecondary}
										strokeOpacity={0.58}
										strokeWidth={1}
										strokeLinejoin="round"
										strokeLinecap="round"
									/>
									<SvgText
										x={label.x}
										y={label.y + 4}
										fill={theme.colors.textSecondary}
										fontSize={12}
										textAnchor={label.textAnchor}
									>
										{label.text}
									</SvgText>
									<Rect
										x={label.bounds.left}
										y={label.bounds.top}
										width={label.bounds.right - label.bounds.left}
										height={label.bounds.bottom - label.bounds.top}
										fill={theme.colors.card}
										fillOpacity={0.001}
										onPress={() => select(label.id)}
									/>
								</G>
							);
						})}
					</Svg>
				</>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		width: "100%",
		height: DONUT_CHART_HEIGHT,
		position: "relative",
	},
	pie: { position: "absolute" },
	center: {
		width: CENTER_CONTENT_WIDTH,
		alignItems: "center",
	},
	centerLabel: { fontSize: 12 },
	centerValue: {
		width: "100%",
		fontSize: 16,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
		marginTop: 2,
		textAlign: "center",
	},
	centerSub: { fontSize: 11, marginTop: 2, fontVariant: ["tabular-nums"] },
});
