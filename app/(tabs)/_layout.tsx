import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FloatingTabBar } from "@/components/navigation/tab-bar";
import { useFloatingTabBarInset } from "@/components/navigation/floating-tab-bar";
import { AddTransactionButton } from "@/features/dashboard/add-transaction-button";
import { TabHeader } from "@/components/navigation/tab-header";
import {
	TabPagerViewport,
	useTabPagerController,
} from "@/components/navigation/tab-pager";
import { useHeadlessTabRouter } from "@/components/navigation/tab-router-adapter";
import { useTheme } from "@/theme";

/** Composes the headless Expo router with the interruptible three-slot pager. */

export default function TabLayout() {
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const tabBarInset = useFloatingTabBarInset();
	const router = useRouter();
	const reduceMotion = useReducedMotion();

	const { scenes, activeRouteName, routerContract, NavigationContent } =
		useHeadlessTabRouter();
	const pager = useTabPagerController({
		router: routerContract,
		activeRouteName,
		reduceMotion,
	});
	const state = pager.state;

	return (
		<View style={{ flex: 1, backgroundColor: theme.colors.background }}>
			{/* Headless tabs require the app shell to own the safe-area header. */}
			<View
				style={[
					styles.header,
					{ backgroundColor: theme.colors.card, paddingTop: insets.top },
				]}
			>
				<TabHeader
					activeName={state.anchorName}
					phase={state.phase}
					anchorIndex={pager.anchorIndex}
					translateX={pager.translateX}
					viewportWidth={pager.viewportWidthValue}
					opacityFor={pager.opacityFor}
					onSearch={() => router.push("/transactions/search")}
				/>
			</View>
			<View style={{ flex: 1 }}>
				<NavigationContent>
					<TabPagerViewport
						scenes={scenes}
						controller={pager}
						style={{ backgroundColor: theme.colors.background }}
					/>
				</NavigationContent>
			</View>
			<FloatingTabBar
				activeName={state.anchorName}
				visualTabPosition={pager.visualTabPosition}
				pillTranslateX={pager.pillTranslateX}
				onPillStepChange={pager.setPillStep}
				onPressTab={pager.pressTab}
				onLongPressTab={pager.longPressTab}
			/>
			<AddTransactionButton bottom={tabBarInset + 8} />
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		position: "relative",
		minHeight: 44,
	},
});
