import { motion } from "@/theme/motion";

export const TAB_DEFINITIONS = [
	{ name: "index", href: "/" },
	{ name: "ledger", href: "/ledger" },
	{ name: "profile", href: "/profile" },
] as const;

export type TabRouteName = (typeof TAB_DEFINITIONS)[number]["name"];

export const EDGE_DRAG_DAMPING = 0.5;
export const GESTURE_COMMIT_DISTANCE_FRACTION = 0.3;
export const GESTURE_COMMIT_VELOCITY_PT_PER_SEC = 600;
export const GESTURE_RELEASE_MIN_MS = 90;

export function isTabRouteName(name: string | undefined): name is TabRouteName {
	return TAB_DEFINITIONS.some((definition) => definition.name === name);
}

export function canonicalTabIndex(name: TabRouteName): number {
	return TAB_DEFINITIONS.findIndex((definition) => definition.name === name);
}

/**
 * Tabs whose scene must exist in the tree, given the current transition.
 *
 * Visibility is decided by worklets on the UI thread while mounting happens on the JS
 * thread, so the mounted set has to stay a superset of whatever the pager can make
 * visible without waiting for React. Two cases drive this:
 *
 * - `Gesture.Pan().onStart` reveals the anchor's neighbours synchronously, so they must
 *   already be mounted. A transition's target becomes the next anchor, so its neighbours
 *   are included too — otherwise a swipe started right as the animation lands would race
 *   React and flash an empty scene.
 * - A non-adjacent press makes its target visible immediately, so `targetName` and
 *   `ghostName` are always included.
 *
 * Scenes are never dropped once mounted: rebuilding one would discard its scroll position
 * and re-run its queries, and the steady state then matches the previous eager behaviour.
 */
export function mountedTabNames(
	state: Pick<TabPagerState, "anchorName" | "targetName" | "ghostName">,
	previouslyMounted: readonly TabRouteName[] = [],
): readonly TabRouteName[] {
	const mounted = new Set<TabRouteName>(previouslyMounted);
	const anchors: TabRouteName[] = [state.anchorName];
	for (const name of [state.targetName, state.ghostName]) {
		if (name === null) continue;
		mounted.add(name);
		anchors.push(name);
	}
	for (const definition of TAB_DEFINITIONS) {
		const index = canonicalTabIndex(definition.name);
		const reachable = anchors.some(
			(anchor) => Math.abs(index - canonicalTabIndex(anchor)) <= 1,
		);
		if (reachable) mounted.add(definition.name);
	}
	return TAB_DEFINITIONS.filter((definition) =>
		mounted.has(definition.name),
	).map((definition) => definition.name);
}

export function logicalTabSlot(
	anchorIndex: number,
	sceneIndex: number,
): -1 | 0 | 1 {
	"worklet";
	if (sceneIndex === anchorIndex) return 0;
	return sceneIndex < anchorIndex ? -1 : 1;
}

export function clampDragDisplacement(anchorIndex: number, raw: number): number {
	"worklet";
	if (anchorIndex === 0) {
		return raw < 0 ? Math.max(raw, -1) : raw * EDGE_DRAG_DAMPING;
	}
	if (anchorIndex === TAB_DEFINITIONS.length - 1) {
		return raw > 0 ? Math.min(raw, 1) : raw * EDGE_DRAG_DAMPING;
	}
	return Math.max(-1, Math.min(1, raw));
}

export function tabDirection(
	anchorName: TabRouteName,
	targetName: TabRouteName,
): -1 | 1 {
	return canonicalTabIndex(targetName) < canonicalTabIndex(anchorName) ? -1 : 1;
}

export function tabEndpoint(
	anchorName: TabRouteName,
	targetName: TabRouteName,
): -1 | 1 {
	return tabDirection(anchorName, targetName) === 1 ? -1 : 1;
}

export type TabPagerPhase = "idle" | "animating" | "dragging" | "returning";

export type TabPagerState = {
	phase: TabPagerPhase;
	anchorName: TabRouteName;
	targetName: TabRouteName | null;
	ghostName: TabRouteName | null;
	transitionId: number;
	displacement: number;
};

export const INITIAL_TAB_PAGER_STATE: TabPagerState = {
	phase: "idle",
	anchorName: "index",
	targetName: null,
	ghostName: null,
	transitionId: 0,
	displacement: 0,
};

export type TabPagerEvent =
	| { type: "PRESS"; name: TabRouteName; reducedMotion: boolean }
	| { type: "GESTURE_START"; displacement: number }
	| {
			type: "GESTURE_UPDATE";
			transitionId: number;
			displacement: number;
			intentDisplacement: number;
	  }
	| {
			type: "GESTURE_END";
			transitionId: number;
			displacement: number;
			intentDisplacement: number;
			velocity: number;
			widthPx: number;
			reducedMotion: boolean;
	  }
	| {
			type: "GESTURE_CANCEL";
			transitionId: number;
			reducedMotion: boolean;
	  }
	| { type: "ANIMATION_COMPLETE"; transitionId: number }
	| { type: "EXTERNAL_NAVIGATION"; name: TabRouteName };

export type TabPagerCommand =
	| { type: "CANCEL_ANIMATION" }
	| {
			type: "CONFIGURE_PROGRAM";
			targetName: TabRouteName;
			ghostName: TabRouteName | null;
			crossfadeFrom: TabRouteName | null;
	  }
	| { type: "CONFIGURE_RETURN"; ghostName: TabRouteName | null }
	| {
			type: "ANIMATE_TO";
			displacement: number;
			durationMs: number;
			transitionId: number;
	  }
	| { type: "SETTLE_ANCHOR"; name: TabRouteName }
	| { type: "COMMIT_ROUTER"; name: TabRouteName };

export type TabPagerResult = {
	state: TabPagerState;
	commands: readonly TabPagerCommand[];
};

const NO_COMMANDS: readonly TabPagerCommand[] = [];

function noop(state: TabPagerState): TabPagerResult {
	return { state, commands: NO_COMMANDS };
}

function neighborForDisplacement(
	anchorName: TabRouteName,
	displacement: number,
): TabRouteName | null {
	const anchorIndex = canonicalTabIndex(anchorName);
	if (displacement < -0.001) {
		return TAB_DEFINITIONS[anchorIndex + 1]?.name ?? null;
	}
	if (displacement > 0.001) {
		return TAB_DEFINITIONS[anchorIndex - 1]?.name ?? null;
	}
	return null;
}

function releaseDuration(remaining: number): number {
	return Math.round(
		Math.min(
			motion.tab,
			Math.max(GESTURE_RELEASE_MIN_MS, motion.tab * Math.abs(remaining)),
		),
	);
}

function latestVisibleTarget(state: TabPagerState): TabRouteName | null {
	return state.targetName ?? state.ghostName;
}

function handlePress(
	state: TabPagerState,
	name: TabRouteName,
	reducedMotion: boolean,
): TabPagerResult {
	if (name === state.targetName) return noop(state);

	if (name === state.anchorName) {
		if (state.phase === "idle" || state.phase === "returning") {
			return noop(state);
		}
		const transitionId = state.transitionId + 1;
		if (reducedMotion) {
			return {
				state: {
					...state,
					phase: "idle",
					targetName: null,
					ghostName: null,
					transitionId,
					displacement: 0,
				},
				commands: [
					{ type: "CANCEL_ANIMATION" },
					{ type: "SETTLE_ANCHOR", name: state.anchorName },
				],
			};
		}
		const ghostName = latestVisibleTarget(state);
		return {
			state: {
				...state,
				phase: "returning",
				targetName: null,
				ghostName,
				transitionId,
			},
			commands: [
				{ type: "CONFIGURE_RETURN", ghostName },
				{
					type: "ANIMATE_TO",
					displacement: 0,
					durationMs: motion.tab,
					transitionId,
				},
			],
		};
	}

	const transitionId = state.transitionId + 1;
	if (reducedMotion) {
		return {
			state: {
				phase: "idle",
				anchorName: name,
				targetName: null,
				ghostName: null,
				transitionId,
				displacement: 0,
			},
			commands: [
				{ type: "CANCEL_ANIMATION" },
				{ type: "SETTLE_ANCHOR", name },
				{ type: "COMMIT_ROUTER", name },
			],
		};
	}

	const previousTarget = latestVisibleTarget(state);
	const sameSide =
		previousTarget !== null &&
		tabDirection(state.anchorName, previousTarget) ===
			tabDirection(state.anchorName, name);
	const ghostName = previousTarget !== name ? previousTarget : null;
	return {
		state: {
			...state,
			phase: "animating",
			targetName: name,
			ghostName,
			transitionId,
		},
		commands: [
			{
				type: "CONFIGURE_PROGRAM",
				targetName: name,
				ghostName,
				crossfadeFrom: sameSide ? previousTarget : null,
			},
			{
				type: "ANIMATE_TO",
				displacement: tabEndpoint(state.anchorName, name),
				durationMs: motion.tab,
				transitionId,
			},
		],
	};
}

function handleGestureStart(
	state: TabPagerState,
	displacement: number,
): TabPagerResult {
	if (state.phase === "dragging") return noop(state);
	const anchorName =
		state.phase === "animating" && state.targetName !== null
			? state.targetName
			: state.anchorName;
	const clamped = clampDragDisplacement(
		canonicalTabIndex(anchorName),
		displacement,
	);
	return {
		state: {
			...state,
			phase: "dragging",
			anchorName,
			targetName: null,
			ghostName: null,
			transitionId: state.transitionId + 1,
			displacement: clamped,
		},
		commands: [{ type: "CANCEL_ANIMATION" }],
	};
}

function handleGestureUpdate(
	state: TabPagerState,
	transitionId: number,
	displacement: number,
	intentDisplacement: number,
): TabPagerResult {
	if (state.phase !== "dragging" || transitionId !== state.transitionId) {
		return noop(state);
	}
	const clamped = clampDragDisplacement(
		canonicalTabIndex(state.anchorName),
		displacement,
	);
	return {
		state: {
			...state,
			targetName: neighborForDisplacement(
				state.anchorName,
				intentDisplacement,
			),
			displacement: clamped,
		},
		commands: NO_COMMANDS,
	};
}

function shouldCommitGesture(options: {
	targetName: TabRouteName | null;
	displacement: number;
	velocity: number;
	widthPx: number;
}): boolean {
	if (options.targetName === null) return false;
	const distanceCommit =
		Math.abs(options.displacement) >= GESTURE_COMMIT_DISTANCE_FRACTION;
	const velocityPxPerSecond = options.velocity * options.widthPx;
	const velocityCommit =
		Math.abs(velocityPxPerSecond) >= GESTURE_COMMIT_VELOCITY_PT_PER_SEC &&
		Math.sign(options.velocity) === Math.sign(options.displacement);
	return distanceCommit || velocityCommit;
}

function handleGestureEnd(
	state: TabPagerState,
	event: Extract<TabPagerEvent, { type: "GESTURE_END" }>,
): TabPagerResult {
	if (state.phase !== "dragging" || event.transitionId !== state.transitionId) {
		return noop(state);
	}
	const displacement = clampDragDisplacement(
		canonicalTabIndex(state.anchorName),
		event.displacement,
	);
	const intentDisplacement = clampDragDisplacement(
		canonicalTabIndex(state.anchorName),
		event.intentDisplacement,
	);
	const targetName = neighborForDisplacement(
		state.anchorName,
		intentDisplacement,
	);
	const commit = shouldCommitGesture({
		targetName,
		displacement: intentDisplacement,
		velocity: event.velocity,
		widthPx: event.widthPx,
	});

	if (commit && targetName !== null) {
		if (event.reducedMotion) {
			return {
				state: {
					phase: "idle",
					anchorName: targetName,
					targetName: null,
					ghostName: null,
					transitionId: state.transitionId,
					displacement: 0,
				},
				commands: [
					{ type: "SETTLE_ANCHOR", name: targetName },
					{ type: "COMMIT_ROUTER", name: targetName },
				],
			};
		}
		const endpoint = tabEndpoint(state.anchorName, targetName);
		return {
			state: {
				...state,
				phase: "animating",
				targetName,
				ghostName: null,
				displacement,
			},
			commands: [
				{
					type: "CONFIGURE_PROGRAM",
					targetName,
					ghostName: null,
					crossfadeFrom: null,
				},
				{
					type: "ANIMATE_TO",
					displacement: endpoint,
					durationMs: releaseDuration(endpoint - displacement),
					transitionId: state.transitionId,
				},
			],
		};
	}

	if (event.reducedMotion) {
		return {
			state: {
				...state,
				phase: "idle",
				targetName: null,
				ghostName: null,
				displacement: 0,
			},
			commands: [
				{ type: "SETTLE_ANCHOR", name: state.anchorName },
				{ type: "COMMIT_ROUTER", name: state.anchorName },
			],
		};
	}
	return {
		state: {
			...state,
			phase: "returning",
			targetName: null,
			ghostName: targetName,
			displacement,
		},
		commands: [
			{ type: "CONFIGURE_RETURN", ghostName: targetName },
			{
				type: "ANIMATE_TO",
				displacement: 0,
				durationMs: releaseDuration(displacement),
				transitionId: state.transitionId,
			},
		],
	};
}

function handleGestureCancel(
	state: TabPagerState,
	transitionId: number,
	reducedMotion: boolean,
): TabPagerResult {
	if (state.phase !== "dragging" || transitionId !== state.transitionId) {
		return noop(state);
	}
	const targetName = state.targetName;
	if (reducedMotion) {
		return {
			state: {
				...state,
				phase: "idle",
				targetName: null,
				ghostName: null,
				displacement: 0,
			},
			commands: [
				{ type: "SETTLE_ANCHOR", name: state.anchorName },
				{ type: "COMMIT_ROUTER", name: state.anchorName },
			],
		};
	}
	return {
		state: {
			...state,
			phase: "returning",
			targetName: null,
			ghostName: targetName,
		},
		commands: [
			{ type: "CONFIGURE_RETURN", ghostName: targetName },
			{
				type: "ANIMATE_TO",
				displacement: 0,
				durationMs: releaseDuration(state.displacement),
				transitionId: state.transitionId,
			},
		],
	};
}

function handleAnimationComplete(
	state: TabPagerState,
	transitionId: number,
): TabPagerResult {
	if (transitionId !== state.transitionId) return noop(state);
	if (state.phase === "animating" && state.targetName !== null) {
		const name = state.targetName;
		return {
			state: {
				phase: "idle",
				anchorName: name,
				targetName: null,
				ghostName: null,
				transitionId: state.transitionId,
				displacement: 0,
			},
			commands: [
				{ type: "SETTLE_ANCHOR", name },
				{ type: "COMMIT_ROUTER", name },
			],
		};
	}
	if (state.phase === "returning") {
		return {
			state: {
				...state,
				phase: "idle",
				targetName: null,
				ghostName: null,
				displacement: 0,
			},
			commands: [
				{ type: "SETTLE_ANCHOR", name: state.anchorName },
				{ type: "COMMIT_ROUTER", name: state.anchorName },
			],
		};
	}
	return noop(state);
}

export function reduceTabPager(
	state: TabPagerState,
	event: TabPagerEvent,
): TabPagerResult {
	switch (event.type) {
		case "PRESS":
			return handlePress(state, event.name, event.reducedMotion);
		case "GESTURE_START":
			return handleGestureStart(state, event.displacement);
		case "GESTURE_UPDATE":
			return handleGestureUpdate(
				state,
				event.transitionId,
				event.displacement,
				event.intentDisplacement,
			);
		case "GESTURE_END":
			return handleGestureEnd(state, event);
		case "GESTURE_CANCEL":
			return handleGestureCancel(
				state,
				event.transitionId,
				event.reducedMotion,
			);
		case "ANIMATION_COMPLETE":
			return handleAnimationComplete(state, event.transitionId);
		case "EXTERNAL_NAVIGATION":
			if (event.name === state.anchorName && state.phase === "idle") {
				return noop(state);
			}
			return {
				state: {
					phase: "idle",
					anchorName: event.name,
					targetName: null,
					ghostName: null,
					transitionId: state.transitionId + 1,
					displacement: 0,
				},
				commands: [
					{ type: "CANCEL_ANIMATION" },
					{ type: "SETTLE_ANCHOR", name: event.name },
				],
			};
	}
}
