import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";
import { Icon } from "@/components/Icon";
import { zh } from "@/i18n/zh";
import { useTheme } from "@/theme";
import { TAB_TITLES } from "./tab-bar";
import {
	canonicalTabIndex,
	logicalTabSlot,
	TAB_DEFINITIONS,
	type TabPagerPhase,
	type TabRouteName,
} from "./tab-pager-machine";

export function tabHeaderTranslateX(
	anchorIndex: number,
	sceneIndex: number,
	viewportWidth: number,
	translateX: number,
): number {
	"worklet";
	return (
		logicalTabSlot(anchorIndex, sceneIndex) * viewportWidth + translateX
	);
}

function TabHeaderLayer(props: {
	name: TabRouteName;
	activeName: TabRouteName;
	phase: TabPagerPhase;
	anchorIndex: SharedValue<number>;
	translateX: SharedValue<number>;
	viewportWidth: SharedValue<number>;
	opacity: SharedValue<number>;
	onSearch: () => void;
}) {
	const theme = useTheme();
	const sceneIndex = canonicalTabIndex(props.name);
	const active = props.name === props.activeName;
	const actionEnabled = active && props.phase === "idle";
	const animatedStyle = useAnimatedStyle(() => {
		const anchorIndex = props.anchorIndex.get();
		const viewportWidth = props.viewportWidth.get();
		return {
			opacity:
				viewportWidth > 0 || sceneIndex === anchorIndex
					? props.opacity.get()
					: 0,
			transform: [
				{
					translateX: tabHeaderTranslateX(
						anchorIndex,
						sceneIndex,
						viewportWidth,
						props.translateX.get(),
					),
				},
			],
		};
	}, [
		props.anchorIndex,
		props.opacity,
		props.translateX,
		props.viewportWidth,
		sceneIndex,
	]);

	return (
		<Animated.View
			testID={`tab-header-layer-${props.name}`}
			pointerEvents={actionEnabled ? "box-none" : "none"}
			accessibilityElementsHidden={!active}
			importantForAccessibility={active ? "auto" : "no-hide-descendants"}
			style={[styles.layer, animatedStyle]}
		>
			<Text
				accessibilityRole="header"
				style={[styles.title, { color: theme.colors.text }]}
			>
				{TAB_TITLES[props.name]}
			</Text>
			{(props.name === "index" || props.name === "ledger") && (
				<Pressable
					onPress={props.onSearch}
					disabled={!actionEnabled}
					hitSlop={12}
					style={styles.rightAction}
					accessibilityLabel={zh.txList.searchAction}
				>
					<Icon name="search" size={23} color={theme.colors.text} />
				</Pressable>
			)}
		</Animated.View>
	);
}

export function TabHeader(props: {
	activeName: TabRouteName;
	phase: TabPagerPhase;
	anchorIndex: SharedValue<number>;
	translateX: SharedValue<number>;
	viewportWidth: SharedValue<number>;
	opacityFor: (name: TabRouteName) => SharedValue<number>;
	onSearch: () => void;
}) {
	return (
		<View style={styles.bar}>
			{TAB_DEFINITIONS.map(({ name }) => (
				<TabHeaderLayer
					key={name}
					name={name}
					activeName={props.activeName}
					phase={props.phase}
					anchorIndex={props.anchorIndex}
					translateX={props.translateX}
					viewportWidth={props.viewportWidth}
					opacity={props.opacityFor(name)}
					onSearch={props.onSearch}
				/>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		position: "relative",
		height: 32,
		overflow: "hidden",
	},
	layer: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	title: { fontSize: 17, fontWeight: "600" },
	rightAction: {
		position: "absolute",
		right: 8,
		width: 32,
		height: 32,
		alignItems: "center",
		justifyContent: "center",
	},
});
