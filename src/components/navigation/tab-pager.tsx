import {
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector, State } from "react-native-gesture-handler";
import Animated, {
	Easing,
	cancelAnimation,
	useAnimatedStyle,
	useDerivedValue,
	useSharedValue,
	withTiming,
	type EasingFunction,
	type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import { motion } from "@/theme/motion";
import {
	INITIAL_TAB_PAGER_STATE,
	TAB_DEFINITIONS,
	canonicalTabIndex,
	clampDragDisplacement,
	logicalTabSlot,
	mountedTabNames,
	reduceTabPager,
	tabEndpoint,
	type TabPagerCommand,
	type TabPagerResult,
	type TabPagerState,
	type TabRouteName,
} from "./tab-pager-machine";

const GESTURE_ACTIVE_OFFSET = 12;
const GESTURE_FAIL_OFFSET = 12;

export type TabSceneSpec = {
	name: TabRouteName;
	render: () => ReactNode;
};

export type TabRouterContract = {
	routeKeyFor(name: TabRouteName): string;
	jumpTo(name: TabRouteName): void;
	emitTabPress(target: string): boolean;
	emitTabLongPress(target: string): void;
};

type TabPagerGesture = ReturnType<typeof Gesture.Pan>;

type VisualIntent = {
	token: number;
	gestureSession: number;
};

export type TabPagerController = {
	state: TabPagerState;
	gesture: TabPagerGesture;
	translateX: SharedValue<number>;
	visualTabPosition: SharedValue<number>;
	pillTranslateX: SharedValue<number>;
	anchorIndex: SharedValue<number>;
	viewportWidthValue: SharedValue<number>;
	viewportWidth: number;
	opacityFor(name: TabRouteName): SharedValue<number>;
	pressTab(name: TabRouteName): void;
	longPressTab(name: TabRouteName): void;
	syncRouterState(name: TabRouteName): void;
	setViewportWidth(width: number): void;
	setPillStep(width: number): void;
};

function setIdleVisibility(
	opacities: readonly SharedValue<number>[],
	anchorIndex: number,
): void {
	"worklet";
	for (let index = 0; index < opacities.length; index += 1) {
		cancelAnimation(opacities[index]!);
		opacities[index]!.value = Math.abs(index - anchorIndex) <= 1 ? 1 : 0;
	}
}

function configureGestureTakeoverVisibility(
	opacities: readonly SharedValue<number>[],
	previousAnchorIndex: number,
	takeoverAnchorIndex: number,
): void {
	"worklet";
	setIdleVisibility(opacities, takeoverAnchorIndex);
	if (Math.abs(previousAnchorIndex - takeoverAnchorIndex) <= 1) return;

	const replacementIndex =
		previousAnchorIndex < takeoverAnchorIndex
			? takeoverAnchorIndex - 1
			: takeoverAnchorIndex + 1;
	opacities[previousAnchorIndex]!.value = 1;
	opacities[replacementIndex]!.value = 0;
	opacities[previousAnchorIndex]!.value = withTiming(0, {
		duration: motion.fast,
	});
	opacities[replacementIndex]!.value = withTiming(1, {
		duration: motion.fast,
	});
}

function cancelVisualAnimations(
	translateX: SharedValue<number>,
	pillPosition: SharedValue<number>,
	opacities: readonly SharedValue<number>[],
): void {
	"worklet";
	cancelAnimation(translateX);
	cancelAnimation(pillPosition);
	for (const opacity of opacities) cancelAnimation(opacity);
}

function claimVisualIntent(
	visualIntentToken: SharedValue<number>,
	gestureSession: SharedValue<number>,
	intent: VisualIntent,
): boolean {
	"worklet";
	if (intent.gestureSession !== gestureSession.value) return false;
	if (intent.token <= visualIntentToken.value) return false;
	visualIntentToken.value = intent.token;
	return true;
}

function configureProgramVisibility(
	opacities: readonly SharedValue<number>[],
	panLive: SharedValue<boolean>,
	anchorIndex: number,
	targetIndex: number,
	ghostIndex: number,
	crossfadeFromIndex: number,
): void {
	"worklet";
	panLive.value = false;
	const fromOpacity =
		crossfadeFromIndex >= 0 ? opacities[crossfadeFromIndex]!.value : 1;
	for (const opacity of opacities) {
		cancelAnimation(opacity);
		opacity.value = 0;
	}
	opacities[anchorIndex]!.value = 1;
	if (ghostIndex >= 0) opacities[ghostIndex]!.value = 1;
	if (crossfadeFromIndex >= 0 && crossfadeFromIndex !== targetIndex) {
		opacities[crossfadeFromIndex]!.value = fromOpacity > 0 ? fromOpacity : 1;
		opacities[targetIndex]!.value = 0;
		opacities[crossfadeFromIndex]!.value = withTiming(0, {
			duration: motion.fast,
		});
		opacities[targetIndex]!.value = withTiming(1, {
			duration: motion.fast,
		});
	} else {
		opacities[targetIndex]!.value = 1;
	}
}

function configureReturnVisibility(
	opacities: readonly SharedValue<number>[],
	panLive: SharedValue<boolean>,
	anchorIndex: number,
	ghostIndex: number,
): void {
	"worklet";
	panLive.value = false;
	for (const opacity of opacities) {
		cancelAnimation(opacity);
		opacity.value = 0;
	}
	opacities[anchorIndex]!.value = 1;
	if (ghostIndex >= 0) opacities[ghostIndex]!.value = 1;
}

function startVisualTiming(
	translateX: SharedValue<number>,
	widthValue: SharedValue<number>,
	anchorIndex: SharedValue<number>,
	pillPosition: SharedValue<number>,
	panLive: SharedValue<boolean>,
	opacities: readonly SharedValue<number>[],
	displacement: number,
	durationMs: number,
	transitionId: number,
	pillTargetIndex: number,
	completionAnchorIndex: number,
	notifyAnimationComplete: (transitionId: number) => void,
	visualIntentToken: SharedValue<number>,
	gestureSession: SharedValue<number>,
	intent: VisualIntent,
): void {
	"worklet";
	cancelAnimation(translateX);
	cancelAnimation(pillPosition);
	translateX.value = withTiming(
		displacement * widthValue.value,
		{
			duration: durationMs,
			easing: Easing.out(Easing.cubic) as EasingFunction,
		},
		(finished) => {
			if (
				!finished ||
				visualIntentToken.value !== intent.token ||
				gestureSession.value !== intent.gestureSession
			) {
				return;
			}
			anchorIndex.value = completionAnchorIndex;
			translateX.value = 0;
			pillPosition.value = completionAnchorIndex;
			panLive.value = false;
			setIdleVisibility(opacities, completionAnchorIndex);
			scheduleOnRN(notifyAnimationComplete, transitionId);
		},
	);
	pillPosition.value = withTiming(pillTargetIndex, {
		duration: durationMs,
		easing: Easing.out(Easing.cubic) as EasingFunction,
	});
}

function neighborIndex(anchorIndex: number, displacement: number): number {
	"worklet";
	if (displacement < -0.001 && anchorIndex < TAB_DEFINITIONS.length - 1) {
		return anchorIndex + 1;
	}
	if (displacement > 0.001 && anchorIndex > 0) return anchorIndex - 1;
	return anchorIndex;
}

function gesturePillPosition(anchorIndex: number, displacement: number): number {
	"worklet";
	const targetIndex = neighborIndex(anchorIndex, displacement);
	return (
		anchorIndex +
		(targetIndex - anchorIndex) * Math.min(1, Math.abs(displacement))
	);
}

function stateRendersSame(left: TabPagerState, right: TabPagerState): boolean {
	return (
		left.phase === right.phase &&
		left.anchorName === right.anchorName &&
		left.targetName === right.targetName &&
		left.ghostName === right.ghostName &&
		left.transitionId === right.transitionId
	);
}

export function useTabPagerController(options: {
	router: TabRouterContract;
	activeRouteName: TabRouteName;
	reduceMotion: boolean;
}): TabPagerController {
	const initialState = useMemo<TabPagerState>(
		() => ({
			...INITIAL_TAB_PAGER_STATE,
			anchorName: options.activeRouteName,
		}),
		[],
	);
	const stateRef = useRef(initialState);
	const renderedStateRef = useRef(initialState);
	const [state, setState] = useState(initialState);
	const [viewportWidth, setViewportWidthState] = useState(0);
	const routerRef = useRef(options.router);
	routerRef.current = options.router;
	const reduceMotionRef = useRef(options.reduceMotion);
	reduceMotionRef.current = options.reduceMotion;
	const routerInFlightRef = useRef<TabRouteName | null>(null);
	const queuedRouterTargetRef = useRef<TabRouteName | null>(null);
	const confirmedRouterNameRef = useRef(options.activeRouteName);
	const gestureSessionRef = useRef(0);
	const ignoredGestureSessionRef = useRef(0);

	const initialAnchorIndex = canonicalTabIndex(options.activeRouteName);
	const translateX = useSharedValue(0);
	const widthValue = useSharedValue(0);
	const anchorIndex = useSharedValue(initialAnchorIndex);
	const pillStep = useSharedValue(0);
	const pillPosition = useSharedValue(initialAnchorIndex);
	const panLive = useSharedValue(false);
	const gestureSession = useSharedValue(0);
	const gestureStartDisplacement = useSharedValue(0);
	const gestureTakeoverIndex = useSharedValue(initialAnchorIndex);
	const visualIntentToken = useSharedValue(0);
	const visualIntentCounterRef = useRef(0);
	const indexOpacity = useSharedValue(
		Math.abs(initialAnchorIndex) <= 1 ? 1 : 0,
	);
	const ledgerOpacity = useSharedValue(
		Math.abs(1 - initialAnchorIndex) <= 1 ? 1 : 0,
	);
	const profileOpacity = useSharedValue(
		Math.abs(2 - initialAnchorIndex) <= 1 ? 1 : 0,
	);
	const opacities = useMemo(
		() => [indexOpacity, ledgerOpacity, profileOpacity] as const,
		[indexOpacity, ledgerOpacity, profileOpacity],
	);

	const pillTranslateX = useDerivedValue(
		() => pillPosition.value * pillStep.value,
	);
	const nextVisualIntent = useCallback((): VisualIntent => {
		const token = Math.max(
			visualIntentCounterRef.current,
			visualIntentToken.value,
		) + 1;
		visualIntentCounterRef.current = token;
		return { token, gestureSession: gestureSession.value };
	}, [gestureSession, visualIntentToken]);

	const animationCompleteRef = useRef<(transitionId: number) => void>(() => {});
	const notifyAnimationComplete = useCallback((transitionId: number) => {
		animationCompleteRef.current(transitionId);
	}, []);

	const cancelAnimations = useCallback(() => {
		const intent = nextVisualIntent();
		scheduleOnUI(() => {
			"worklet";
			if (
				!claimVisualIntent(
					visualIntentToken,
					gestureSession,
					intent,
				)
			) {
				return;
			}
			cancelVisualAnimations(translateX, pillPosition, opacities);
		});
	}, [
		gestureSession,
		nextVisualIntent,
		opacities,
		pillPosition,
		translateX,
		visualIntentToken,
	]);

	const configureProgram = useCallback(
		(options: {
			anchorName: TabRouteName;
			targetName: TabRouteName;
			ghostName: TabRouteName | null;
			crossfadeFrom: TabRouteName | null;
			animation: {
				displacement: number;
				durationMs: number;
				transitionId: number;
				pillTargetIndex: number;
				completionAnchorIndex: number;
			};
		}) => {
			const currentAnchorIndex = canonicalTabIndex(options.anchorName);
			const targetIndex = canonicalTabIndex(options.targetName);
			const ghostIndex =
				options.ghostName === null
					? -1
					: canonicalTabIndex(options.ghostName);
			const crossfadeFromIndex =
				options.crossfadeFrom === null
					? -1
					: canonicalTabIndex(options.crossfadeFrom);
			const intent = nextVisualIntent();
			scheduleOnUI(() => {
				"worklet";
				if (
					!claimVisualIntent(
						visualIntentToken,
						gestureSession,
						intent,
					)
				) {
					return;
				}
				configureProgramVisibility(
					opacities,
					panLive,
					currentAnchorIndex,
					targetIndex,
					ghostIndex,
					crossfadeFromIndex,
				);
				gestureTakeoverIndex.value = targetIndex;
				startVisualTiming(
					translateX,
					widthValue,
					anchorIndex,
					pillPosition,
					panLive,
					opacities,
					options.animation.displacement,
					options.animation.durationMs,
					options.animation.transitionId,
					options.animation.pillTargetIndex,
					options.animation.completionAnchorIndex,
					notifyAnimationComplete,
					visualIntentToken,
					gestureSession,
					intent,
				);
			});
		},
		[
			anchorIndex,
			gestureSession,
			gestureTakeoverIndex,
			nextVisualIntent,
			notifyAnimationComplete,
			opacities,
			panLive,
			pillPosition,
			translateX,
			visualIntentToken,
			widthValue,
		],
	);

	const configureReturn = useCallback(
		(options: {
			anchorName: TabRouteName;
			ghostName: TabRouteName | null;
			animation: {
				displacement: number;
				durationMs: number;
				transitionId: number;
				pillTargetIndex: number;
				completionAnchorIndex: number;
			};
		}) => {
			const { anchorName, ghostName } = options;
			const currentAnchorIndex = canonicalTabIndex(anchorName);
			const ghostIndex =
				ghostName === null ? -1 : canonicalTabIndex(ghostName);
			const intent = nextVisualIntent();
			scheduleOnUI(() => {
				"worklet";
				if (
					!claimVisualIntent(
						visualIntentToken,
						gestureSession,
						intent,
					)
				) {
					return;
				}
				configureReturnVisibility(
					opacities,
					panLive,
					currentAnchorIndex,
					ghostIndex,
				);
				gestureTakeoverIndex.value = currentAnchorIndex;
				startVisualTiming(
					translateX,
					widthValue,
					anchorIndex,
					pillPosition,
					panLive,
					opacities,
					options.animation.displacement,
					options.animation.durationMs,
					options.animation.transitionId,
					options.animation.pillTargetIndex,
					options.animation.completionAnchorIndex,
					notifyAnimationComplete,
					visualIntentToken,
					gestureSession,
					intent,
				);
			});
		},
		[
			anchorIndex,
			gestureSession,
			gestureTakeoverIndex,
			nextVisualIntent,
			notifyAnimationComplete,
			opacities,
			panLive,
			pillPosition,
			translateX,
			visualIntentToken,
			widthValue,
		],
	);

	const animateTo = useCallback(
		(options: {
			displacement: number;
			durationMs: number;
			transitionId: number;
			pillTargetIndex: number;
			completionAnchorIndex: number;
		}) => {
			const intent = nextVisualIntent();
			scheduleOnUI(() => {
				"worklet";
				if (
					!claimVisualIntent(
						visualIntentToken,
						gestureSession,
						intent,
					)
				) {
					return;
				}
				startVisualTiming(
					translateX,
					widthValue,
					anchorIndex,
					pillPosition,
					panLive,
					opacities,
					options.displacement,
					options.durationMs,
					options.transitionId,
					options.pillTargetIndex,
					options.completionAnchorIndex,
					notifyAnimationComplete,
					visualIntentToken,
					gestureSession,
					intent,
				);
			});
		},
		[
			anchorIndex,
			gestureSession,
			nextVisualIntent,
			notifyAnimationComplete,
			opacities,
			panLive,
			pillPosition,
			translateX,
			visualIntentToken,
			widthValue,
		],
	);

	const commitRouter = useCallback((name: TabRouteName) => {
		if (routerInFlightRef.current === null) {
			if (confirmedRouterNameRef.current === name) return;
			routerInFlightRef.current = name;
			routerRef.current.jumpTo(name);
			return;
		}
		queuedRouterTargetRef.current = name;
	}, []);

	const settleAnchor = useCallback(
		(name: TabRouteName, commitAfterSettle: boolean) => {
			const nextAnchorIndex = canonicalTabIndex(name);
			const intent = nextVisualIntent();
			scheduleOnUI(() => {
				"worklet";
				if (
					!claimVisualIntent(
						visualIntentToken,
						gestureSession,
						intent,
					)
				) {
					return;
				}
				cancelVisualAnimations(translateX, pillPosition, opacities);
				panLive.value = false;
				anchorIndex.value = nextAnchorIndex;
				gestureTakeoverIndex.value = nextAnchorIndex;
				translateX.value = 0;
				pillPosition.value = nextAnchorIndex;
				setIdleVisibility(opacities, nextAnchorIndex);
				if (commitAfterSettle) scheduleOnRN(commitRouter, name);
			});
		},
		[
			anchorIndex,
			commitRouter,
			gestureSession,
			gestureTakeoverIndex,
			nextVisualIntent,
			opacities,
			panLive,
			pillPosition,
			translateX,
			visualIntentToken,
		],
	);

	const applyRef = useRef<(result: TabPagerResult) => void>(() => {});
	const apply = useCallback(
		(result: TabPagerResult) => {
			const previous = stateRef.current;
			const next = result.state;
			if (next !== previous) {
				stateRef.current = next;
				if (!stateRendersSame(renderedStateRef.current, next)) {
					renderedStateRef.current = next;
					setState(next);
				}
			}

			const animateCommand = result.commands.find(
				(command): command is Extract<
					TabPagerCommand,
					{ type: "ANIMATE_TO" }
				> => command.type === "ANIMATE_TO",
			);
			const hasConfiguredAnimation = result.commands.some(
				(command) =>
					command.type === "CONFIGURE_PROGRAM" ||
					command.type === "CONFIGURE_RETURN",
			);
			const hasSettle = result.commands.some(
				(command) => command.type === "SETTLE_ANCHOR",
			);
			const routerCommitName = result.commands.find(
				(command) => command.type === "COMMIT_ROUTER",
			)?.name;
			const animationOptions =
				animateCommand === undefined
					? null
					: {
							displacement: animateCommand.displacement,
							durationMs: animateCommand.durationMs,
							transitionId: animateCommand.transitionId,
							pillTargetIndex: canonicalTabIndex(
								next.targetName ?? next.anchorName,
							),
							completionAnchorIndex:
								next.phase === "animating" && next.targetName !== null
									? canonicalTabIndex(next.targetName)
									: canonicalTabIndex(next.anchorName),
						};

			for (const command of result.commands) {
				switch (command.type) {
					case "CANCEL_ANIMATION":
						if (!hasSettle) cancelAnimations();
						break;
					case "CONFIGURE_PROGRAM":
						if (animationOptions === null) break;
						configureProgram({
							anchorName: next.anchorName,
							targetName: command.targetName,
							ghostName: command.ghostName,
							crossfadeFrom: command.crossfadeFrom,
							animation: animationOptions,
						});
						break;
					case "CONFIGURE_RETURN":
						if (animationOptions === null) break;
						configureReturn({
							anchorName: next.anchorName,
							ghostName: command.ghostName,
							animation: animationOptions,
						});
						break;
					case "ANIMATE_TO": {
						if (!hasConfiguredAnimation && animationOptions !== null) {
							animateTo(animationOptions);
						}
						break;
					}
					case "SETTLE_ANCHOR":
						settleAnchor(command.name, routerCommitName === command.name);
						break;
					case "COMMIT_ROUTER":
						if (!hasSettle) commitRouter(command.name);
						break;
				}
			}
		},
		[
			animateTo,
			cancelAnimations,
			commitRouter,
			configureProgram,
			configureReturn,
			settleAnchor,
		],
	);
	applyRef.current = apply;

	animationCompleteRef.current = (transitionId: number) => {
		applyRef.current(
			reduceTabPager(stateRef.current, {
				type: "ANIMATION_COMPLETE",
				transitionId,
			}),
		);
	};

	const onGestureStart = useCallback(
		(session: number, displacement: number) => {
			if (session <= ignoredGestureSessionRef.current) return;
			gestureSessionRef.current = session;
			applyRef.current(
				reduceTabPager(stateRef.current, {
					type: "GESTURE_START",
					displacement,
				}),
			);
		},
		[],
	);
	const onGestureUpdate = useCallback(
		(
			session: number,
			displacement: number,
			intentDisplacement: number,
		) => {
			if (session !== gestureSessionRef.current) return;
			const current = stateRef.current;
			applyRef.current(
				reduceTabPager(current, {
					type: "GESTURE_UPDATE",
					transitionId: current.transitionId,
					displacement,
					intentDisplacement,
				}),
			);
		},
		[],
	);
	const onGestureEnd = useCallback(
		(
			session: number,
			displacement: number,
			intentDisplacement: number,
			velocity: number,
		) => {
			if (session !== gestureSessionRef.current) return;
			const current = stateRef.current;
			applyRef.current(
				reduceTabPager(current, {
					type: "GESTURE_END",
					transitionId: current.transitionId,
					displacement,
					intentDisplacement,
					velocity,
					widthPx: widthValue.value,
					reducedMotion: reduceMotionRef.current,
				}),
			);
		},
		[widthValue],
	);
	const onGestureCancel = useCallback((session: number) => {
		if (session !== gestureSessionRef.current) return;
		const current = stateRef.current;
		applyRef.current(
			reduceTabPager(current, {
				type: "GESTURE_CANCEL",
				transitionId: current.transitionId,
				reducedMotion: reduceMotionRef.current,
			}),
		);
	}, []);

	const gesture = useMemo(
		() =>
			Gesture.Pan()
				.enabled(viewportWidth > 0)
				.activeOffsetX([-GESTURE_ACTIVE_OFFSET, GESTURE_ACTIVE_OFFSET])
				.failOffsetY([-GESTURE_FAIL_OFFSET, GESTURE_FAIL_OFFSET])
				.onStart(() => {
					const width = widthValue.value;
					if (width <= 0) return;
					gestureSession.value += 1;
					const previousAnchorIndex = anchorIndex.value;
					const nextAnchorIndex = gestureTakeoverIndex.value;
					const currentDisplacement = translateX.value / width;
					cancelVisualAnimations(translateX, pillPosition, opacities);
					let rebasedDisplacement = currentDisplacement;
					if (nextAnchorIndex !== previousAnchorIndex) {
						const previousEndpoint =
							nextAnchorIndex > previousAnchorIndex ? -1 : 1;
						rebasedDisplacement =
							currentDisplacement - previousEndpoint;
						anchorIndex.value = nextAnchorIndex;
						translateX.value = rebasedDisplacement * width;
					}
					configureGestureTakeoverVisibility(
						opacities,
						previousAnchorIndex,
						nextAnchorIndex,
					);
					panLive.value = true;
					gestureStartDisplacement.value = rebasedDisplacement;
					pillPosition.value = gesturePillPosition(
						nextAnchorIndex,
						gestureStartDisplacement.value,
					);
					scheduleOnRN(
						onGestureStart,
						gestureSession.value,
						gestureStartDisplacement.value,
					);
				})
				.onUpdate((event) => {
					const width = widthValue.value;
					if (!panLive.value || width <= 0) return;
					const intentDisplacement = clampDragDisplacement(
						anchorIndex.value,
						event.translationX / width,
					);
					const displacement = clampDragDisplacement(
						anchorIndex.value,
						gestureStartDisplacement.value + event.translationX / width,
					);
					translateX.value = displacement * width;
					pillPosition.value = gesturePillPosition(
						anchorIndex.value,
						displacement,
					);
					scheduleOnRN(
						onGestureUpdate,
						gestureSession.value,
						displacement,
						intentDisplacement,
					);
				})
				.onEnd((event) => {
					const width = widthValue.value;
					if (!panLive.value || width <= 0) return;
					const intentDisplacement = clampDragDisplacement(
						anchorIndex.value,
						event.translationX / width,
					);
					const displacement = clampDragDisplacement(
						anchorIndex.value,
						gestureStartDisplacement.value + event.translationX / width,
					);
					scheduleOnRN(
						onGestureEnd,
						gestureSession.value,
						displacement,
						intentDisplacement,
						event.velocityX / width,
					);
				})
				.onFinalize((event) => {
					if (!panLive.value || event.state === State.END) return;
					scheduleOnRN(onGestureCancel, gestureSession.value);
				}),
		[
			anchorIndex,
			gestureSession,
			gestureStartDisplacement,
			gestureTakeoverIndex,
			onGestureCancel,
			onGestureEnd,
			onGestureStart,
			onGestureUpdate,
			opacities,
			panLive,
			pillPosition,
			translateX,
			viewportWidth,
			widthValue,
		],
	);

	const pressTab = useCallback(
		(name: TabRouteName) => {
			const routeKey = routerRef.current.routeKeyFor(name);
			if (routerRef.current.emitTabPress(routeKey)) return;
			ignoredGestureSessionRef.current = Math.max(
				ignoredGestureSessionRef.current,
				gestureSession.value,
			);
			gestureSessionRef.current = -1;
			const current = stateRef.current;
			if (current.phase === "idle" && name === current.anchorName) {
				settleAnchor(name, false);
			}
			applyRef.current(
				reduceTabPager(current, {
					type: "PRESS",
					name,
					reducedMotion: reduceMotionRef.current,
				}),
			);
		},
		[gestureSession, settleAnchor],
	);

	const longPressTab = useCallback((name: TabRouteName) => {
		routerRef.current.emitTabLongPress(routerRef.current.routeKeyFor(name));
	}, []);

	const syncRouterState = useCallback((name: TabRouteName) => {
		if (routerInFlightRef.current === name) {
			confirmedRouterNameRef.current = name;
			routerInFlightRef.current = null;
			const queued = queuedRouterTargetRef.current;
			queuedRouterTargetRef.current = null;
			if (queued !== null && queued !== name) {
				routerInFlightRef.current = queued;
				routerRef.current.jumpTo(queued);
			}
			return;
		}

		const current = stateRef.current;
		confirmedRouterNameRef.current = name;
		if (name === current.anchorName && current.phase === "idle") return;
		ignoredGestureSessionRef.current = Math.max(
			ignoredGestureSessionRef.current,
			gestureSession.value,
		);
		gestureSessionRef.current = -1;
		routerInFlightRef.current = null;
		queuedRouterTargetRef.current = null;
		applyRef.current(
			reduceTabPager(current, {
				type: "EXTERNAL_NAVIGATION",
				name,
			}),
		);
	}, [gestureSession]);

	useLayoutEffect(() => {
		syncRouterState(options.activeRouteName);
	}, [options.activeRouteName, syncRouterState]);

	const setViewportWidth = useCallback(
		(width: number) => {
			if (width <= 0) return;
			const current = stateRef.current;
			setViewportWidthState(width);
			scheduleOnUI(() => {
				"worklet";
				const previousWidth = widthValue.value;
				const normalized =
					previousWidth > 0 ? translateX.value / previousWidth : 0;
				widthValue.value = width;
				translateX.value = normalized * width;
			});
			if (current.phase === "animating" && current.targetName !== null) {
				animateTo({
					displacement: tabEndpoint(
						current.anchorName,
						current.targetName,
					),
					durationMs: motion.tab,
					transitionId: current.transitionId,
					pillTargetIndex: canonicalTabIndex(current.targetName),
					completionAnchorIndex: canonicalTabIndex(current.targetName),
				});
			} else if (current.phase === "returning") {
				animateTo({
					displacement: 0,
					durationMs: motion.tab,
					transitionId: current.transitionId,
					pillTargetIndex: canonicalTabIndex(current.anchorName),
					completionAnchorIndex: canonicalTabIndex(current.anchorName),
				});
			}
		},
		[animateTo, translateX, widthValue],
	);

	const setPillStep = useCallback(
		(width: number) => {
			pillStep.value = Math.max(0, width);
		},
		[pillStep],
	);

	const opacityFor = useCallback(
		(name: TabRouteName) => opacities[canonicalTabIndex(name)]!,
		[opacities],
	);

	return {
		state,
		gesture,
		translateX,
		visualTabPosition: pillPosition,
		pillTranslateX,
		anchorIndex,
		viewportWidthValue: widthValue,
		viewportWidth,
		opacityFor,
		pressTab,
		longPressTab,
		syncRouterState,
		setViewportWidth,
		setPillStep,
	};
}

function TabPagerScene(props: {
	scene: TabSceneSpec;
	active: boolean;
	mounted: boolean;
	viewportWidth: number;
	opacity: SharedValue<number>;
	anchorIndex: SharedValue<number>;
	viewportWidthValue: SharedValue<number>;
	translateX: SharedValue<number>;
}) {
	const sceneIndex = canonicalTabIndex(props.scene.name);
	const {
		active,
		anchorIndex,
		opacity,
		translateX,
		viewportWidth,
		viewportWidthValue,
	} = props;
	const animatedStyle = useAnimatedStyle(() => {
		const currentAnchorIndex = anchorIndex.value;
		const slot = logicalTabSlot(currentAnchorIndex, sceneIndex);
		return {
			opacity: opacity.value,
			transform: [
				{
					translateX:
						slot * viewportWidthValue.value + translateX.value,
				},
			],
		};
	}, [anchorIndex, opacity, sceneIndex, translateX, viewportWidthValue]);

	return (
		<Animated.View
			testID={`tab-pager-scene-${props.scene.name}`}
			pointerEvents={active ? "auto" : "none"}
			accessibilityElementsHidden={!active}
			importantForAccessibility={active ? "auto" : "no-hide-descendants"}
			style={[
				styles.scene,
				{ width: viewportWidth },
				animatedStyle,
			]}
		>
			{props.mounted ? props.scene.render() : null}
		</Animated.View>
	);
}

export function TabPagerViewport(props: {
	scenes: readonly TabSceneSpec[];
	controller: TabPagerController;
	style?: StyleProp<ViewStyle>;
}) {
	const state = props.controller.state;
	// Grown during render, not in an effect: a non-adjacent press makes its target visible
	// in the same commit, so the scene has to mount alongside that state change.
	const mountedRef = useRef<readonly TabRouteName[]>([]);
	mountedRef.current = mountedTabNames(state, mountedRef.current);
	const mounted = mountedRef.current;

	return (
		<GestureDetector gesture={props.controller.gesture}>
			<Animated.View
				testID="tab-pager-viewport"
				style={[styles.container, props.style]}
				onLayout={(event) =>
					props.controller.setViewportWidth(event.nativeEvent.layout.width)
				}
			>
				{props.scenes.map((scene) => (
					<TabPagerScene
						key={scene.name}
						scene={scene}
						active={scene.name === props.controller.state.anchorName}
						mounted={mounted.includes(scene.name)}
						viewportWidth={props.controller.viewportWidth}
						opacity={props.controller.opacityFor(scene.name)}
						anchorIndex={props.controller.anchorIndex}
						viewportWidthValue={props.controller.viewportWidthValue}
						translateX={props.controller.translateX}
					/>
				))}
			</Animated.View>
		</GestureDetector>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		overflow: "hidden",
	},
	scene: {
		position: "absolute",
		top: 0,
		left: 0,
		bottom: 0,
	},
});
