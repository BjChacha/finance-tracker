import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
	BackHandler,
	type LayoutChangeEvent,
	Pressable,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
	AppState,
	type AppStateStatus,
} from "react-native";
import Animated, {
	cancelAnimation,
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
import { Icon, type IconName } from "@/components/Icon";
import { zh } from "@/i18n/zh";
import { motion, useTheme } from "@/theme";

export type SheetVariant = "compact" | "large";
export type SheetDismiss = (afterDismiss?: () => void) => void;

type SheetRenderContext = {
	dismiss: SheetDismiss;
};

type SheetSlot = ReactNode | ((context: SheetRenderContext) => ReactNode);

type Props = {
	children: SheetSlot;
	variant?: SheetVariant;
	title?: string;
	headerLeft?: SheetSlot | null;
	headerRight?: SheetSlot;
	dismissOnBackdrop?: boolean;
	onBeforeDismiss?: () => boolean | Promise<boolean>;
	onDismiss?: () => void;
	onBackPress?: () => boolean;
	onEntered?: () => void;
	beforeEntry?: () => void | Promise<void>;
	initialScrimOpacity?: number;
	skipEntryAnimation?: boolean;
	skipExitAnimation?: boolean;
};

type SheetHeaderIconButtonProps = {
	icon: IconName;
	label: string;
	onPress: () => void;
	color?: string;
};

export type SecondarySheetSurfaceProps = {
	visible: boolean;
	preparing?: boolean;
	interactive?: boolean;
	children: ReactNode;
	variant?: SheetVariant;
	title?: string;
	headerLeft?: ReactNode | null;
	headerRight?: ReactNode;
	dismissOnBackdrop?: boolean;
	onRequestDismiss: () => void;
	onEntered?: () => void;
	onExited?: () => void;
};

const sheetEasing = Easing.bezier(...motion.sheetCurve);

const SheetDismissContext = createContext<SheetDismiss | null>(null);

export function useSheetDismiss(): SheetDismiss {
	const dismiss = useContext(SheetDismissContext);
	if (!dismiss) {
		throw new Error("useSheetDismiss must be used inside SecondarySheetScreen");
	}
	return dismiss;
}

export function SheetHeaderIconButton({
	icon,
	label,
	onPress,
	color,
}: SheetHeaderIconButtonProps) {
	const { colors } = useTheme();

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			hitSlop={8}
			style={styles.headerButton}
			onPress={onPress}
		>
			<Icon name={icon} size={22} color={color ?? colors.primary} />
		</Pressable>
	);
}

export function SecondarySheetSurface({
	visible,
	preparing = false,
	interactive = visible,
	children,
	variant = "large",
	title,
	headerLeft,
	headerRight,
	dismissOnBackdrop = true,
	onRequestDismiss,
	onEntered,
	onExited,
}: SecondarySheetSurfaceProps) {
	const { height } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const { colors } = useTheme();
	const progress = useSharedValue(0);
	const travelDistance = useSharedValue(height + insets.bottom + 32);
	const [laidOut, setLaidOut] = useState(false);
	const [presented, setPresented] = useState(false);
	const visibleRef = useRef(visible);
	const lastAnimatedTargetRef = useRef(0);
	const onEnteredRef = useRef(onEntered);
	const onExitedRef = useRef(onExited);
	const previousVariantRef = useRef(variant);
	const shouldAnimateLayout = previousVariantRef.current !== variant;

	useEffect(() => {
		visibleRef.current = visible;
	}, [visible]);

	useEffect(() => {
		onEnteredRef.current = onEntered;
		onExitedRef.current = onExited;
	}, [onEntered, onExited]);

	useEffect(() => {
		previousVariantRef.current = variant;
	}, [variant]);

	const notifyTransitionFinished = useCallback((opened: boolean) => {
		if (visibleRef.current !== opened) return;
		if (opened) onEnteredRef.current?.();
		else {
			setPresented(false);
			onExitedRef.current?.();
		}
	}, []);

	useEffect(() => {
		if (visible || preparing) setPresented(true);
	}, [preparing, visible]);

	useEffect(() => {
		if (!laidOut) return;
		const target = visible ? 1 : 0;
		if (lastAnimatedTargetRef.current === target) return;
		lastAnimatedTargetRef.current = target;
		progress.value = withTiming(
			target,
			{
				duration: visible ? motion.sheetEnter : motion.sheetExit,
				easing: sheetEasing,
				reduceMotion: ReduceMotion.System,
			},
			(finished) => {
				if (finished) runOnJS(notifyTransitionFinished)(target === 1);
			},
		);
	}, [laidOut, notifyTransitionFinished, progress, visible]);

	// Foreground recovery: a transition interrupted by backgrounding can leave the surface
	// frozen mid-animation (vsync-backed completion callbacks are dropped). Re-drive toward
	// the current target so onEntered/onExited still fire instead of stranding the sheet.
	useEffect(() => {
		if (process.env.EXPO_OS !== "android") return;
		const subscription = AppState.addEventListener(
			"change",
			(state: AppStateStatus) => {
				if (state !== "active" || !laidOut) return;
				const target = visibleRef.current ? 1 : 0;
				cancelAnimation(progress);
				progress.value = withTiming(
					target,
					{
						duration: visibleRef.current ? motion.sheetEnter : motion.sheetExit,
						easing: sheetEasing,
						reduceMotion: ReduceMotion.System,
					},
					(finished) => {
						if (finished) runOnJS(notifyTransitionFinished)(target === 1);
					},
				);
			},
		);
		return () => subscription.remove();
	}, [laidOut, notifyTransitionFinished, progress]);

	useEffect(() => {
		if (!laidOut || visible || !preparing) return;
		progress.value = 0.001;
	}, [laidOut, preparing, progress, visible]);

	useEffect(() => {
		if (!visible || process.env.EXPO_OS !== "android") return;
		const subscription = BackHandler.addEventListener(
			"hardwareBackPress",
			() => {
				onRequestDismiss();
				return true;
			},
		);
		return () => subscription.remove();
	}, [onRequestDismiss, visible]);

	const handleCardLayout = useCallback(
		(event: LayoutChangeEvent) => {
			travelDistance.value =
				event.nativeEvent.layout.height + Math.max(insets.bottom, 12);
			setLaidOut(true);
		},
		[insets.bottom, travelDistance],
	);

	const maxLargeHeight = Math.max(0, height - insets.top - 12);
	const largeHeight = Math.min(Math.round(height * 0.82), maxLargeHeight);
	// 卡片 opacity 只在 progress 前段快速淡入，之后保持不透明：
	// 若与 progress 同步衰减，退出时卡片在前 1/4 时长内就淡成半透明，
	// 剩余 3/4 的下滑过程几乎不可见（「退出看不到动画」的根因）。
	const cardAnimatedStyle = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [0, 0.15, 1], [0, 1, 1]),
		transform: [{ translateY: (1 - progress.value) * travelDistance.value }],
	}));
	const scrimAnimatedStyle = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [0, 1], [0, 0.38]),
	}));
	const showHeader =
		title !== undefined ||
		headerLeft !== undefined ||
		headerRight !== undefined;
	const surfaceActive = presented || visible || preparing;

	return (
		<View
			testID="secondary-sheet-surface"
			pointerEvents={surfaceActive ? "box-none" : "none"}
			style={styles.root}
		>
			<Animated.View
				pointerEvents="none"
				style={[StyleSheet.absoluteFill, styles.scrim, scrimAnimatedStyle]}
			/>
			{dismissOnBackdrop && surfaceActive && (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={zh.common.close}
					accessibilityElementsHidden={!visible}
					importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
					style={StyleSheet.absoluteFill}
					onPress={onRequestDismiss}
				/>
			)}

			<Animated.View
				testID="secondary-sheet-card"
				renderToHardwareTextureAndroid
				onLayout={handleCardLayout}
				layout={
					shouldAnimateLayout
						? LinearTransition.duration(motion.sheetEnter)
								.easing(sheetEasing)
								.reduceMotion(ReduceMotion.System)
						: undefined
				}
				style={[
					styles.cardShell,
					variant === "large" ? { height: largeHeight } : styles.compactShell,
					cardAnimatedStyle,
				]}
			>
				<View
					accessibilityViewIsModal={visible}
					style={[
						styles.cardSurface,
						variant === "large" && styles.largeSurface,
						{ backgroundColor: colors.background, borderColor: colors.border },
					]}
				>
					{showHeader && (
						<View style={[styles.header, { backgroundColor: colors.card }]}>
							<View style={styles.headerSide}>
								{headerLeft === undefined ? (
									<Pressable
										accessibilityRole="button"
										accessibilityLabel={zh.common.close}
										hitSlop={8}
										style={styles.headerButton}
										onPress={onRequestDismiss}
									>
										<Icon name="x" size={22} color={colors.text} />
									</Pressable>
								) : (
									headerLeft
								)}
							</View>
							<Text
								numberOfLines={1}
								style={[styles.headerTitle, { color: colors.text }]}
							>
								{title}
							</Text>
							<View style={styles.headerSide}>{headerRight}</View>
						</View>
					)}
					<View
						pointerEvents={interactive ? "auto" : "none"}
						style={
							variant === "large"
								? [styles.largeBody, { paddingBottom: insets.bottom }]
								: undefined
						}
					>
						{children}
					</View>
				</View>
			</Animated.View>
		</View>
	);
}

export function SecondarySheetScreen({
	children,
	variant = "large",
	title,
	headerLeft,
	headerRight,
	dismissOnBackdrop = true,
	onBeforeDismiss,
	onDismiss,
	onBackPress,
	onEntered,
	beforeEntry,
	initialScrimOpacity = 0,
	skipEntryAnimation = false,
	skipExitAnimation = false,
}: Props) {
	const router = useRouter();
	const { height } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const { colors } = useTheme();
	const progress = useSharedValue(skipEntryAnimation ? 1 : 0);
	const travelDistance = useSharedValue(height + insets.bottom + 32);
	const closingRef = useRef(false);
	const dismissRequestRef = useRef(false);
	const entryStartedRef = useRef(false);
	const entryCompletedRef = useRef(false);
	const entryFrameRef = useRef<number | null>(null);
	const entryPreparationRef = useRef(0);
	const onEnteredRef = useRef(onEntered);
	const beforeEntryRef = useRef(beforeEntry);
	const dismissActionRef = useRef<() => void>(onDismiss ?? router.back);
	const previousVariantRef = useRef(variant);
	const shouldAnimateLayout = previousVariantRef.current !== variant;

	useEffect(() => {
		dismissActionRef.current = onDismiss ?? router.back;
	}, [onDismiss, router]);

	useEffect(() => {
		onEnteredRef.current = onEntered;
		beforeEntryRef.current = beforeEntry;
	}, [beforeEntry, onEntered]);

	useEffect(() => {
		previousVariantRef.current = variant;
	}, [variant]);

	useEffect(
		() => () => {
			entryPreparationRef.current += 1;
			if (entryFrameRef.current !== null) {
				cancelAnimationFrame(entryFrameRef.current);
			}
		},
		[],
	);

	const notifyEntered = useCallback(() => {
		entryCompletedRef.current = true;
		onEnteredRef.current?.();
	}, []);

	// Re-usable entry starter: also invoked by foreground recovery below.
	const beginEntryFromCurrentState = useCallback(() => {
		const preparation = entryPreparationRef.current + 1;
		entryPreparationRef.current = preparation;

		const startEntry = () => {
			if (closingRef.current || entryPreparationRef.current !== preparation) {
				return;
			}
			entryFrameRef.current = requestAnimationFrame(() => {
				entryFrameRef.current = null;
				if (closingRef.current || entryPreparationRef.current !== preparation) {
					return;
				}
				if (skipEntryAnimation) {
					notifyEntered();
					return;
				}
				progress.value = withTiming(
					1,
					{
						duration: motion.sheetEnter,
						easing: sheetEasing,
						reduceMotion: ReduceMotion.System,
					},
					(finished) => {
						if (finished) runOnJS(notifyEntered)();
					},
				);
			});
		};

		try {
			const result = beforeEntryRef.current?.();
			if (result && typeof result.then === "function") {
				void Promise.resolve(result).then(startEntry, startEntry);
				return;
			}
		} catch {
			// Entry preparation is fail-open so a native handoff cannot strand the sheet.
		}
		startEntry();
	}, [notifyEntered, progress, skipEntryAnimation]);

	const handleCardLayout = useCallback(
		(event: LayoutChangeEvent) => {
			const measuredTravelDistance =
				event.nativeEvent.layout.height + Math.max(insets.bottom, 12);
			if (entryStartedRef.current) {
				if (entryCompletedRef.current) {
					travelDistance.value = measuredTravelDistance;
				}
				return;
			}
			if (closingRef.current) return;
			travelDistance.value = measuredTravelDistance;
			entryStartedRef.current = true;
			beginEntryFromCurrentState();
		},
		[beginEntryFromCurrentState, insets.bottom, travelDistance],
	);

	const finishDismiss = useCallback(() => {
		dismissActionRef.current();
	}, []);

	const startDismiss = useCallback<SheetDismiss>(
		(afterDismiss) => {
			if (closingRef.current) return;
			closingRef.current = true;
			if (afterDismiss) dismissActionRef.current = afterDismiss;
			if (skipExitAnimation) {
				finishDismiss();
				return;
			}
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
		},
		[finishDismiss, progress, skipExitAnimation],
	);

	// Foreground recovery: the OS can drop vsync-backed callbacks (native postOnAnimation,
	// rAF, withTiming completion) while the sheet is mid-entry or mid-exit. Without this a
	// backgrounded sheet keeps stale closingRef/entryStarted state forever — every dismiss,
	// back and scrim tap is then silently swallowed and the screen is trapped.
	useEffect(() => {
		if (process.env.EXPO_OS !== "android") return;
		const subscription = AppState.addEventListener(
			"change",
			(state: AppStateStatus) => {
				if (state !== "active") return;
				if (closingRef.current) {
					// A dismiss was requested but its exit never completed. Complete it now without
					// replaying the exit animation: the user already left mid-dismiss, so finishing
					// the action beats trapping the screen behind a dead guard.
					dismissRequestRef.current = false;
					finishDismiss();
					return;
				}
				if (entryStartedRef.current && !entryCompletedRef.current) {
					// Entry was interrupted (rAF/withTiming callback dropped): restart it.
					beginEntryFromCurrentState();
					return;
				}
				if (entryCompletedRef.current) {
					// A keypad round-trip can background the activity mid-entry; reanimated then
					// finishes the animation while the view is detached and never re-commits the
					// final style, leaving the card stuck at opacity 0 (screen looks "gone" while
					// the scrim stays). Nudge the shared value to force a fresh style commit.
					progress.value = 0.999;
					progress.value = withTiming(
						1,
						{
							duration: 32,
							easing: sheetEasing,
							reduceMotion: ReduceMotion.System,
						},
					);
				}
			},
		);
		return () => subscription.remove();
	}, [beginEntryFromCurrentState, finishDismiss]);

	const dismiss = useCallback<SheetDismiss>(
		(afterDismiss) => {
			if (closingRef.current || dismissRequestRef.current) return;
			dismissRequestRef.current = true;
			void (async () => {
				try {
					const canDismiss = (await onBeforeDismiss?.()) ?? true;
					dismissRequestRef.current = false;
					if (canDismiss) startDismiss(afterDismiss);
				} catch {
					dismissRequestRef.current = false;
				}
			})();
		},
		[onBeforeDismiss, startDismiss],
	);

	useFocusEffect(
		useCallback(() => {
			closingRef.current = false;
			dismissRequestRef.current = false;
			if (process.env.EXPO_OS !== "android") return;
			const subscription = BackHandler.addEventListener(
				"hardwareBackPress",
				() => {
					if (onBackPress?.()) return true;
					dismiss();
					return true;
				},
			);
			return () => subscription.remove();
		}, [dismiss, onBackPress]),
	);

	const maxLargeHeight = Math.max(0, height - insets.top - 12);
	const largeHeight = Math.min(Math.round(height * 0.82), maxLargeHeight);
	const cardAnimatedStyle = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [0, 0.15, 1], [0, 1, 1]),
		transform: [{ translateY: (1 - progress.value) * travelDistance.value }],
	}));
	const scrimAnimatedStyle = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [0, 1], [initialScrimOpacity, 0.38]),
	}));

	const body =
		typeof children === "function" ? children({ dismiss }) : children;
	const resolvedHeaderLeft =
		typeof headerLeft === "function" ? headerLeft({ dismiss }) : headerLeft;
	const resolvedHeaderRight =
		typeof headerRight === "function" ? headerRight({ dismiss }) : headerRight;
	const showHeader =
		title !== undefined ||
		headerLeft !== undefined ||
		headerRight !== undefined;
	return (
		<SheetDismissContext.Provider value={dismiss}>
			<View style={styles.root}>
				<Animated.View
					testID="secondary-sheet-scrim"
					pointerEvents="none"
					style={[StyleSheet.absoluteFill, styles.scrim, scrimAnimatedStyle]}
				/>
				{dismissOnBackdrop && (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={zh.common.close}
						style={StyleSheet.absoluteFill}
						onPress={() => dismiss()}
					/>
				)}

				<Animated.View
					testID="secondary-sheet-card"
					onLayout={handleCardLayout}
					layout={
						shouldAnimateLayout
							? LinearTransition.duration(motion.sheetEnter)
									.easing(sheetEasing)
									.reduceMotion(ReduceMotion.System)
							: undefined
					}
					style={[
						styles.cardShell,
						variant === "large" ? { height: largeHeight } : styles.compactShell,
						cardAnimatedStyle,
					]}
				>
					<View
						accessibilityViewIsModal
						style={[
							styles.cardSurface,
							variant === "large" && styles.largeSurface,
							{
								backgroundColor: colors.background,
								borderColor: colors.border,
							},
						]}
					>
						{showHeader && (
							<View style={[styles.header, { backgroundColor: colors.card }]}>
								<View style={styles.headerSide}>
									{headerLeft === undefined ? (
										<Pressable
											accessibilityRole="button"
											accessibilityLabel={zh.common.close}
											hitSlop={8}
											style={styles.headerButton}
											onPress={() => dismiss()}
										>
											<Icon name="x" size={22} color={colors.text} />
										</Pressable>
									) : (
										resolvedHeaderLeft
									)}
								</View>
								<Text
									numberOfLines={1}
									style={[styles.headerTitle, { color: colors.text }]}
								>
									{title}
								</Text>
								<View style={styles.headerSide}>{resolvedHeaderRight}</View>
							</View>
						)}
						<View
							style={
								variant === "large"
									? [styles.largeBody, { paddingBottom: insets.bottom }]
									: undefined
							}
						>
							{body}
						</View>
					</View>
				</Animated.View>
			</View>
		</SheetDismissContext.Provider>
	);
}

const styles = StyleSheet.create({
	root: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		justifyContent: "flex-end",
	},
	scrim: {
		backgroundColor: "#000000",
	},
	cardShell: {
		width: "100%",
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.18)",
	},
	compactShell: {
		maxHeight: "72%",
	},
	cardSurface: {
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		borderCurve: "continuous",
		borderWidth: StyleSheet.hairlineWidth,
		borderBottomWidth: 0,
		overflow: "hidden",
	},
	largeSurface: {
		flex: 1,
	},
	largeBody: {
		flex: 1,
	},
	header: {
		minHeight: 52,
		flexDirection: "row",
		alignItems: "center",
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: "rgba(128, 128, 128, 0.22)",
	},
	headerSide: {
		minWidth: 52,
		minHeight: 52,
		paddingHorizontal: 4,
		alignItems: "center",
		justifyContent: "center",
	},
	headerButton: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: {
		flex: 1,
		textAlign: "center",
		fontSize: 16,
		fontWeight: "600",
	},
});
