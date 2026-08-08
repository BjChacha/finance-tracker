import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
	GlassView,
	isGlassEffectAPIAvailable,
	isLiquidGlassAvailable,
} from "expo-glass-effect";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/Icon";
import { zh } from "@/i18n/zh";
import { useTheme } from "@/theme";
import {
	FLOATING_TAB_BAR_BOTTOM_GAP,
	FLOATING_TAB_BAR_HEIGHT,
	FLOATING_TAB_BAR_HORIZONTAL_MARGIN,
} from "./floating-tab-bar";
import { TAB_DEFINITIONS, type TabRouteName } from "./tab-pager-machine";

export const TAB_TITLES: Record<TabRouteName, string> = {
	index: zh.tabs.overview,
	assets: zh.tabs.assets,
	stats: zh.tabs.dashboard,
	profile: zh.tabs.settings,
};

export const TAB_ICONS: Record<TabRouteName, IconName> = {
	index: "house",
	assets: "wallet",
	stats: "chart-pie",
	profile: "user",
};

const TAB_ITEMS_PADDING = 5;
const TAB_ITEMS_GAP = 2;
const INACTIVE_TAB_SCALE = 0.96;

export function tabHighlightWeight(position: number, tabIndex: number): number {
	"worklet";
	return 1 - Math.min(1, Math.abs(position - tabIndex));
}

function AnimatedTabItem(props: {
	activeName: TabRouteName;
	index: number;
	name: TabRouteName;
	visualTabPosition: SharedValue<number>;
	onPress: () => void;
	onLongPress: () => void;
}) {
	const theme = useTheme();
	const { activeName, index, name, visualTabPosition, onPress, onLongPress } =
		props;
	const focused = name === activeName;
	const activeStyle = useAnimatedStyle(() => {
		const weight = tabHighlightWeight(visualTabPosition.value, index);
		return {
			opacity: weight,
			transform: [
				{
					scale: INACTIVE_TAB_SCALE + (1 - INACTIVE_TAB_SCALE) * weight,
				},
			],
		};
	}, [index, visualTabPosition]);

	return (
		<Pressable
			style={styles.tabItem}
			accessibilityRole="tab"
			accessibilityState={{ selected: focused }}
			accessibilityLabel={TAB_TITLES[name]}
			onPress={onPress}
			onLongPress={onLongPress}
		>
			<View
				style={styles.tabVisual}
				importantForAccessibility="no-hide-descendants"
				accessibilityElementsHidden
			>
				<View style={styles.tabVisualLayer}>
					<Icon
						name={TAB_ICONS[name]}
						size={22}
						color={theme.colors.textSecondary}
					/>
					<Text
						style={[styles.tabLabel, { color: theme.colors.textSecondary }]}
					>
						{TAB_TITLES[name]}
					</Text>
				</View>
				<Animated.View
					testID={`tab-active-layer-${name}`}
					pointerEvents="none"
					style={[
						styles.tabVisualLayer,
						styles.activeTabVisualLayer,
						activeStyle,
					]}
				>
					<Icon name={TAB_ICONS[name]} size={22} color={theme.colors.primary} />
					<Text style={[styles.tabLabel, { color: theme.colors.primary }]}>
						{TAB_TITLES[name]}
					</Text>
				</Animated.View>
			</View>
		</Pressable>
	);
}

/** Floating tab bar driven only by canonical route order and pager output. */
export function FloatingTabBar(props: {
	activeName: TabRouteName;
	visualTabPosition: SharedValue<number>;
	pillTranslateX: SharedValue<number>;
	onPillStepChange: (step: number) => void;
	onPressTab: (name: TabRouteName) => void;
	onLongPressTab: (name: TabRouteName) => void;
}) {
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const [tabItemsWidth, setTabItemsWidth] = useState(0);
	const routeCount = TAB_DEFINITIONS.length;
	const availableWidth =
		tabItemsWidth -
		TAB_ITEMS_PADDING * 2 -
		TAB_ITEMS_GAP * Math.max(0, routeCount - 1);
	const indicatorWidth =
		routeCount > 0 ? Math.max(0, availableWidth / routeCount) : 0;
	const indicatorStep = indicatorWidth + TAB_ITEMS_GAP;
	const glassAvailable =
		process.env.EXPO_OS === "ios" &&
		isLiquidGlassAvailable() &&
		isGlassEffectAPIAvailable();

	useEffect(() => {
		props.onPillStepChange(indicatorStep);
	}, [props.onPillStepChange, indicatorStep]);

	return (
		<View
			style={[
				styles.tabBarShell,
				{
					bottom: insets.bottom + FLOATING_TAB_BAR_BOTTOM_GAP,
				},
			]}
		>
			<View
				style={[
					styles.tabBarSurface,
					{ borderColor: `${theme.colors.border}B8` },
				]}
			>
				{glassAvailable ? (
					<GlassView
						glassEffectStyle="regular"
						colorScheme={theme.dark ? "dark" : "light"}
						pointerEvents="none"
						style={StyleSheet.absoluteFill}
					/>
				) : (
					<View
						pointerEvents="none"
						style={[
							StyleSheet.absoluteFill,
							{ backgroundColor: `${theme.colors.card}F2` },
						]}
					/>
				)}
				<View
					testID="tab-bar-items"
					style={styles.tabItems}
					onLayout={(event) => setTabItemsWidth(event.nativeEvent.layout.width)}
				>
					{indicatorWidth > 0 && (
						<Animated.View
							testID="tab-bar-indicator"
							pointerEvents="none"
							style={[
								styles.tabHighlight,
								{
									width: indicatorWidth,
									backgroundColor: `${theme.colors.primary}18`,
								},
								{ transform: [{ translateX: props.pillTranslateX }] },
							]}
						/>
					)}
					{TAB_DEFINITIONS.map(({ name }, index) => (
						<AnimatedTabItem
							key={name}
							activeName={props.activeName}
							index={index}
							name={name}
							visualTabPosition={props.visualTabPosition}
							onPress={() => props.onPressTab(name)}
							onLongPress={() => props.onLongPressTab(name)}
						/>
					))}
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	tabBarShell: {
		position: "absolute",
		zIndex: 20,
		left: FLOATING_TAB_BAR_HORIZONTAL_MARGIN,
		right: FLOATING_TAB_BAR_HORIZONTAL_MARGIN,
		height: FLOATING_TAB_BAR_HEIGHT,
		boxShadow: "0 8px 28px rgba(0, 0, 0, 0.18)",
	},
	tabBarSurface: {
		flex: 1,
		borderRadius: FLOATING_TAB_BAR_HEIGHT / 2,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	tabItems: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		flexDirection: "row",
		alignItems: "center",
		padding: TAB_ITEMS_PADDING,
		gap: TAB_ITEMS_GAP,
	},
	tabHighlight: {
		position: "absolute",
		top: TAB_ITEMS_PADDING,
		bottom: TAB_ITEMS_PADDING,
		left: TAB_ITEMS_PADDING,
		borderRadius: 25,
	},
	tabItem: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		minHeight: 50,
		borderRadius: 25,
	},
	tabVisual: {
		width: "100%",
		height: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	tabVisualLayer: {
		alignItems: "center",
		justifyContent: "center",
		gap: 2,
	},
	activeTabVisualLayer: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
	},
	tabLabel: { fontSize: 11 },
});
