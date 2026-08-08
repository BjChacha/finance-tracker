import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { FloatingTabBar, TAB_TITLES } from "@/components/navigation/tab-bar";
import {
	TabPagerViewport,
	useTabPagerController,
} from "@/components/navigation/tab-pager";
import { useHeadlessTabRouter } from "@/components/navigation/tab-router-adapter";
import { zh } from "@/i18n/zh";
import { useTheme } from "@/theme";

/** Composes the headless Expo router with the interruptible three-slot pager. */

export default function TabLayout() {
	const theme = useTheme();
	const insets = useSafeAreaInsets();
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
	const title = TAB_TITLES[state.anchorName];

	return (
		<View style={{ flex: 1, backgroundColor: theme.colors.background }}>
			{/* Headless tabs require the app shell to own the safe-area header. */}
			<View
				style={[
					styles.header,
					{ backgroundColor: theme.colors.card, paddingTop: insets.top },
				]}
			>
				<View style={styles.headerBar}>
					<Text style={[styles.headerTitle, { color: theme.colors.text }]}>
						{title}
					</Text>
					{state.anchorName === "index" && (
						<Pressable
							onPress={() => router.push("/transactions/search")}
							hitSlop={12}
							style={styles.headerRight}
							accessibilityLabel={zh.txList.searchAction}
						>
							<Icon name="search" size={23} color={theme.colors.text} />
						</Pressable>
					)}
					{state.anchorName === "assets" && (
						<Pressable
							onPress={() => router.push("/accounts/edit")}
							hitSlop={12}
							style={styles.headerRight}
							accessibilityLabel={zh.accounts.add}
						>
							<Icon name="plus" size={24} color={theme.colors.text} />
						</Pressable>
					)}
				</View>
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
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		position: "relative",
		minHeight: 44,
	},
	// A shared fixed-height row keeps the title and action icon vertically aligned.
	headerBar: {
		position: "relative",
		height: 32,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: { fontSize: 17, fontWeight: "600" },
	headerRight: {
		position: "absolute",
		right: 8,
		width: 32,
		height: 32,
		alignItems: "center",
		justifyContent: "center",
	},
});
