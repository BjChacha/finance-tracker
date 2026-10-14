import { useFocusEffect, useRouter } from "expo-router";
import {
	BackHandler,
	Keyboard,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
	type KeyboardEvent,
} from "react-native";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";
import Animated, {
	Easing,
	interpolate,
	LinearTransition,
	ReduceMotion,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { SingleLineTextInput } from "@/components/single-line-text-input";
import { motion, useTheme } from "@/theme";

type SearchSheetScreenProps = {
	query: string;
	onChangeQuery: (query: string) => void;
	placeholder: string;
	cancelLabel: string;
	clearLabel: string;
	dismissKeyboardLabel: string;
	sheetTitle: string;
	children: ReactNode;
};

const SEARCH_BAR_HEIGHT = 48;
const SEARCH_BAR_GAP = 12;
// 与其他二级界面（SecondarySheetScreen large 变体 height * 0.82）保持一致
const SHEET_HEIGHT_RATIO = 0.82;
const sheetEasing = Easing.bezier(...motion.sheetCurve);

/** Transparent route surface with a top-down search bar and bottom-up results card. */
export function SearchSheetScreen({
	query,
	onChangeQuery,
	placeholder,
	cancelLabel,
	clearLabel,
	dismissKeyboardLabel,
	sheetTitle,
	children,
}: SearchSheetScreenProps) {
	const router = useRouter();
	const { height } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const { colors } = useTheme();
	const progress = useSharedValue(0);
	const closingRef = useRef(false);
	const keyboardVisibleRef = useRef(false);
	const [keyboardScreenY, setKeyboardScreenY] = useState<number | null>(null);

	const keyboardInset =
		keyboardScreenY === null ? 0 : Math.max(0, height - keyboardScreenY);
	const searchTop = insets.top + 8;
	const sheetTopLimit = searchTop + SEARCH_BAR_HEIGHT + SEARCH_BAR_GAP;
	const availableSheetHeight = Math.max(
		0,
		height - sheetTopLimit - keyboardInset,
	);
	const sheetHeight = Math.min(
		Math.round(height * SHEET_HEIGHT_RATIO),
		availableSheetHeight,
	);

	useEffect(() => {
		progress.value = withTiming(1, {
			duration: motion.sheetEnter,
			easing: sheetEasing,
			reduceMotion: ReduceMotion.System,
		});
	}, [progress]);

	useEffect(() => {
		const onShow = (event: KeyboardEvent) => {
			keyboardVisibleRef.current = true;
			setKeyboardScreenY(event.endCoordinates.screenY);
		};
		const onHide = () => {
			keyboardVisibleRef.current = false;
			setKeyboardScreenY(null);
		};
		const showEvent =
			Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
		const hideEvent =
			Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
		const showSubscription = Keyboard.addListener(showEvent, onShow);
		const hideSubscription = Keyboard.addListener(hideEvent, onHide);
		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, []);

	const finishDismiss = useCallback(() => router.back(), [router]);
	const dismiss = useCallback(() => {
		if (closingRef.current) return;
		closingRef.current = true;
		Keyboard.dismiss();
		progress.value = withTiming(
			0,
			{
				duration: motion.sheetExit,
				easing: sheetEasing,
				reduceMotion: ReduceMotion.System,
			},
			(finished) => {
				if (finished) runOnJS(finishDismiss)();
			},
		);
	}, [finishDismiss, progress]);

	useFocusEffect(
		useCallback(() => {
			closingRef.current = false;
			if (process.env.EXPO_OS !== "android") return;
			const subscription = BackHandler.addEventListener(
				"hardwareBackPress",
				() => {
					if (keyboardVisibleRef.current) {
						Keyboard.dismiss();
						return true;
					}
					dismiss();
					return true;
				},
			);
			return () => subscription.remove();
		}, [dismiss]),
	);

	// 与 SecondarySheetScreen 一致：opacity 仅前段快速淡入后保持，避免退出过程被淡出吞掉。
	const searchAnimatedStyle = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [0, 0.15, 1], [0, 1, 1]),
		transform: [
			{ translateY: (1 - progress.value) * -(searchTop + SEARCH_BAR_HEIGHT) },
		],
	}));
	const sheetAnimatedStyle = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [0, 0.15, 1], [0, 1, 1]),
		transform: [
			{
				translateY: (1 - progress.value) * Math.max(sheetHeight, height * 0.5),
			},
		],
	}));
	const scrimAnimatedStyle = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [0, 1], [0, 0.38]),
	}));

	return (
		<View style={styles.root}>
			<Animated.View
				pointerEvents="none"
				style={[StyleSheet.absoluteFill, styles.scrim, scrimAnimatedStyle]}
			/>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={dismissKeyboardLabel}
				style={StyleSheet.absoluteFill}
				onPress={Keyboard.dismiss}
			/>

			<Animated.View
				style={[
					styles.searchRow,
					{ top: searchTop, paddingHorizontal: 12 },
					searchAnimatedStyle,
				]}
			>
				<View
					style={[
						styles.searchBox,
						{ backgroundColor: colors.card, borderColor: colors.border },
					]}
				>
					<Icon name="search" size={18} color={colors.textSecondary} />
					<SingleLineTextInput
						autoFocus
						autoCapitalize="none"
						autoCorrect={false}
						returnKeyType="search"
						value={query}
						onChangeText={onChangeQuery}
						placeholder={placeholder}
						placeholderTextColor={colors.textSecondary}
						selectionColor={colors.primary}
						style={[styles.input, { color: colors.text }]}
					/>
					{query.length > 0 && (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={clearLabel}
							hitSlop={8}
							style={styles.clearButton}
							onPress={() => onChangeQuery("")}
						>
							<Icon name="x" size={17} color={colors.textSecondary} />
						</Pressable>
					)}
				</View>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={cancelLabel}
					hitSlop={8}
					style={styles.cancelButton}
					onPress={dismiss}
				>
					<Text style={[styles.cancelText, { color: colors.onPrimary }]}>
						{cancelLabel}
					</Text>
				</Pressable>
			</Animated.View>

			<Animated.View
				layout={LinearTransition.duration(motion.base)
					.easing(sheetEasing)
					.reduceMotion(ReduceMotion.System)}
				style={[
					styles.sheetShell,
					{ bottom: keyboardInset, height: sheetHeight },
					sheetAnimatedStyle,
				]}
			>
				<View
					accessibilityViewIsModal
					style={[
						styles.sheetSurface,
						{ backgroundColor: colors.background, borderColor: colors.border },
					]}
				>
					<View style={[styles.sheetHeader, { backgroundColor: colors.card }]}>
						<Text style={[styles.sheetTitle, { color: colors.text }]}>
							{sheetTitle}
						</Text>
					</View>
					<View
						style={[
							styles.sheetBody,
							keyboardInset === 0 && { paddingBottom: insets.bottom },
						]}
					>
						{children}
					</View>
				</View>
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
	},
	scrim: { backgroundColor: "#000000" },
	searchRow: {
		position: "absolute",
		left: 0,
		right: 0,
		height: SEARCH_BAR_HEIGHT,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	searchBox: {
		flex: 1,
		height: SEARCH_BAR_HEIGHT,
		flexDirection: "row",
		alignItems: "center",
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 14,
		paddingHorizontal: 12,
		gap: 8,
		boxShadow: "0 6px 20px rgba(0, 0, 0, 0.18)",
	},
	input: {
		flex: 1,
		height: SEARCH_BAR_HEIGHT,
		fontSize: 15,
		paddingVertical: 0,
	},
	clearButton: {
		width: 28,
		height: 28,
		alignItems: "center",
		justifyContent: "center",
	},
	cancelButton: {
		height: SEARCH_BAR_HEIGHT,
		justifyContent: "center",
		paddingHorizontal: 4,
	},
	cancelText: { fontSize: 15, fontWeight: "600" },
	sheetShell: {
		position: "absolute",
		left: 0,
		right: 0,
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.18)",
	},
	sheetSurface: {
		flex: 1,
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		borderCurve: "continuous",
		borderWidth: StyleSheet.hairlineWidth,
		borderBottomWidth: 0,
		overflow: "hidden",
	},
	sheetHeader: {
		minHeight: 52,
		alignItems: "center",
		justifyContent: "center",
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: "rgba(128, 128, 128, 0.22)",
	},
	sheetTitle: { fontSize: 16, fontWeight: "600" },
	sheetBody: { flex: 1 },
});
