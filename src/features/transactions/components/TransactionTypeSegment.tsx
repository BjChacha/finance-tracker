import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
	interpolateColor,
	type SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";
import type { TransactionType } from "@/db/schema";
import { zh } from "@/i18n/zh";
import { useTheme } from "@/theme";

const SEGMENT_PADDING = 4;

export const TRANSACTION_TYPE_TABS: readonly {
	key: TransactionType;
	label: string;
}[] = [
	{ key: "expense", label: zh.tx.expense },
	{ key: "income", label: zh.tx.income },
	{ key: "transfer", label: zh.tx.transfer },
];

export function transactionTypeHighlightWeight(
	position: number,
	tabIndex: number,
): number {
	"worklet";
	return 1 - Math.min(1, Math.abs(position - tabIndex));
}

function TransactionTypeTab(props: {
	type: TransactionType;
	label: string;
	index: number;
	selected: boolean;
	visualPosition: SharedValue<number>;
	onPress: () => void;
}) {
	const theme = useTheme();
	const activeStyle = useAnimatedStyle(() => ({
		opacity: transactionTypeHighlightWeight(
			props.visualPosition.get(),
			props.index,
		),
	}), [props.index, props.visualPosition]);

	return (
		<Pressable
			testID={`transaction-type-tab-${props.type}`}
			accessibilityRole="tab"
			accessibilityLabel={props.label}
			accessibilityState={{ selected: props.selected }}
			style={styles.item}
			onPress={props.onPress}
		>
			<View
				pointerEvents="none"
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
				style={styles.labelStack}
			>
				<Text style={[styles.label, { color: theme.colors.textSecondary }]}>
					{props.label}
				</Text>
				<Animated.View style={[styles.activeLabelLayer, activeStyle]}>
					<Text style={[styles.label, { color: theme.colors.onPrimary }]}>
						{props.label}
					</Text>
				</Animated.View>
			</View>
		</Pressable>
	);
}

export function TransactionTypeSegment(props: {
	type: TransactionType;
	visualPosition: SharedValue<number>;
	onSelect: (type: TransactionType) => void;
}) {
	const theme = useTheme();
	const [width, setWidth] = useState(0);
	const indicatorWidth = Math.max(0, (width - SEGMENT_PADDING * 2) / 3);
	const indicatorStyle = useAnimatedStyle(() => ({
		backgroundColor: interpolateColor(
			props.visualPosition.get(),
			[0, 1, 2],
			[theme.colors.expense, theme.colors.income, theme.colors.transfer],
		),
		transform: [
			{ translateX: props.visualPosition.get() * indicatorWidth },
		],
	}), [
		indicatorWidth,
		props.visualPosition,
		theme.colors.expense,
		theme.colors.income,
		theme.colors.transfer,
	]);

	return (
		<View
			testID="transaction-type-segment"
			style={[styles.container, { backgroundColor: theme.colors.card }]}
			onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
		>
			{indicatorWidth > 0 && (
				<Animated.View
					testID="transaction-type-indicator"
					pointerEvents="none"
					style={[
						styles.indicator,
						{ width: indicatorWidth },
						indicatorStyle,
					]}
				/>
			)}
			{TRANSACTION_TYPE_TABS.map((tab, index) => (
				<TransactionTypeTab
					key={tab.key}
					type={tab.key}
					label={tab.label}
					index={index}
					selected={tab.key === props.type}
					visualPosition={props.visualPosition}
					onPress={() => props.onSelect(tab.key)}
				/>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "relative",
		flexDirection: "row",
		borderRadius: 10,
		padding: SEGMENT_PADDING,
		marginBottom: 12,
	},
	indicator: {
		position: "absolute",
		top: 4,
		bottom: 4,
		left: 4,
		borderRadius: 8,
	},
	item: {
		zIndex: 1,
		flex: 1,
		paddingVertical: 8,
		alignItems: "center",
		borderRadius: 8,
	},
	labelStack: {
		width: "100%",
		alignItems: "center",
		justifyContent: "center",
	},
	activeLabelLayer: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	label: { fontWeight: "600" },
});
