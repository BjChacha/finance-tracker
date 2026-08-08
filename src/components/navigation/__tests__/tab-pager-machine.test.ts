import { motion } from "@/theme/motion";
import {
	GESTURE_COMMIT_DISTANCE_FRACTION,
	GESTURE_COMMIT_VELOCITY_PT_PER_SEC,
	INITIAL_TAB_PAGER_STATE,
	TAB_DEFINITIONS,
	canonicalTabIndex,
	clampDragDisplacement,
	mountedTabNames,
	reduceTabPager,
	tabEndpoint,
	type TabPagerCommand,
	type TabPagerState,
	type TabRouteName,
} from "../tab-pager-machine";

function stateAt(anchorName: TabRouteName): TabPagerState {
	return { ...INITIAL_TAB_PAGER_STATE, anchorName };
}

function commandsOf(result: ReturnType<typeof reduceTabPager>): TabPagerCommand[] {
	return [...result.commands];
}

function draggingAt(
	anchorName: TabRouteName,
	displacement: number,
): TabPagerState {
	const started = reduceTabPager(stateAt(anchorName), {
		type: "GESTURE_START",
		displacement: 0,
	});
	return reduceTabPager(started.state, {
		type: "GESTURE_UPDATE",
		transitionId: started.state.transitionId,
		displacement,
		intentDisplacement: displacement,
	}).state;
}

describe("TabPagerMachine", () => {
	it.each(
		TAB_DEFINITIONS.flatMap((anchor) =>
			TAB_DEFINITIONS.filter((target) => target.name !== anchor.name).map(
				(target) => [anchor.name, target.name] as const,
			),
		),
	)(
		"moves exactly one viewport from %s to %s",
		(anchorName, targetName) => {
			const result = reduceTabPager(stateAt(anchorName), {
				type: "PRESS",
				name: targetName,
				reducedMotion: false,
			});
			const animate = commandsOf(result).find(
				(command) => command.type === "ANIMATE_TO",
			);

			expect(result.state).toMatchObject({
				phase: "animating",
				anchorName,
				targetName,
			});
			expect(animate).toEqual({
				type: "ANIMATE_TO",
				displacement: tabEndpoint(anchorName, targetName),
				durationMs: motion.tab,
				transitionId: 1,
			});
			expect(Math.abs(tabEndpoint(anchorName, targetName))).toBe(1);
		},
	);

	it("crossfades a same-side replacement without resetting displacement", () => {
		const first = reduceTabPager(stateAt("index"), {
			type: "PRESS",
			name: "stats",
			reducedMotion: false,
		});
		const replacement = reduceTabPager(first.state, {
			type: "PRESS",
			name: "profile",
			reducedMotion: false,
		});

		expect(replacement.state).toMatchObject({
			targetName: "profile",
			ghostName: "stats",
			transitionId: 2,
		});
		expect(commandsOf(replacement)[0]).toEqual({
			type: "CONFIGURE_PROGRAM",
			targetName: "profile",
			ghostName: "stats",
			crossfadeFrom: "stats",
		});
	});

	it("keeps the old target as a ghost when replacing across the anchor", () => {
		const first = reduceTabPager(stateAt("assets"), {
			type: "PRESS",
			name: "profile",
			reducedMotion: false,
		});
		const replacement = reduceTabPager(first.state, {
			type: "PRESS",
			name: "index",
			reducedMotion: false,
		});

		expect(replacement.state).toMatchObject({
			targetName: "index",
			ghostName: "profile",
		});
		expect(commandsOf(replacement)[0]).toEqual({
			type: "CONFIGURE_PROGRAM",
			targetName: "index",
			ghostName: "profile",
			crossfadeFrom: null,
		});
	});

	it("promotes the animation target when a gesture takes over", () => {
		const animating: TabPagerState = {
			...stateAt("index"),
			phase: "animating",
			targetName: "profile",
			transitionId: 4,
		};
		const result = reduceTabPager(animating, {
			type: "GESTURE_START",
			displacement: 0.6,
		});

		expect(result.state).toMatchObject({
			phase: "dragging",
			anchorName: "profile",
			targetName: null,
			displacement: 0.6,
			transitionId: 5,
		});
		expect(commandsOf(result)).toEqual([{ type: "CANCEL_ANIMATION" }]);
	});

	it("uses the new gesture intent instead of the rebased visual offset", () => {
		const first = reduceTabPager(stateAt("index"), {
			type: "PRESS",
			name: "assets",
			reducedMotion: false,
		});
		const started = reduceTabPager(first.state, {
			type: "GESTURE_START",
			displacement: 0.65,
		});
		const updated = reduceTabPager(started.state, {
			type: "GESTURE_UPDATE",
			transitionId: started.state.transitionId,
			displacement: 0.4,
			intentDisplacement: -0.25,
		});
		const ended = reduceTabPager(updated.state, {
			type: "GESTURE_END",
			transitionId: updated.state.transitionId,
			displacement: 0.3,
			intentDisplacement: -0.35,
			velocity: 0,
			widthPx: 400,
			reducedMotion: false,
		});

		expect(updated.state).toMatchObject({
			anchorName: "assets",
			targetName: "stats",
			displacement: 0.4,
		});
		expect(ended.state).toMatchObject({
			phase: "animating",
			anchorName: "assets",
			targetName: "stats",
		});
		expect(commandsOf(ended)).toContainEqual({
			type: "ANIMATE_TO",
			displacement: -1,
			durationMs: motion.tab,
			transitionId: updated.state.transitionId,
		});
	});

	it("lets the opposite gesture return from the promoted target", () => {
		const first = reduceTabPager(stateAt("index"), {
			type: "PRESS",
			name: "assets",
			reducedMotion: false,
		});
		const started = reduceTabPager(first.state, {
			type: "GESTURE_START",
			displacement: 0.5,
		});
		const updated = reduceTabPager(started.state, {
			type: "GESTURE_UPDATE",
			transitionId: started.state.transitionId,
			displacement: 0.85,
			intentDisplacement: 0.35,
		});
		const ended = reduceTabPager(updated.state, {
			type: "GESTURE_END",
			transitionId: updated.state.transitionId,
			displacement: 0.85,
			intentDisplacement: 0.35,
			velocity: 0,
			widthPx: 400,
			reducedMotion: false,
		});

		expect(ended.state).toMatchObject({
			phase: "animating",
			anchorName: "assets",
			targetName: "index",
		});
		expect(commandsOf(ended)).toContainEqual(
			expect.objectContaining({
				type: "ANIMATE_TO",
				displacement: 1,
			}),
		);
	});

	it("commits the promoted target when the takeover gesture is cancelled", () => {
		const first = reduceTabPager(stateAt("index"), {
			type: "PRESS",
			name: "assets",
			reducedMotion: false,
		});
		const started = reduceTabPager(first.state, {
			type: "GESTURE_START",
			displacement: 0.5,
		});
		const cancelled = reduceTabPager(started.state, {
			type: "GESTURE_CANCEL",
			transitionId: started.state.transitionId,
			reducedMotion: false,
		});
		const completed = reduceTabPager(cancelled.state, {
			type: "ANIMATION_COMPLETE",
			transitionId: cancelled.state.transitionId,
		});

		expect(cancelled.state).toMatchObject({
			phase: "returning",
			anchorName: "assets",
		});
		expect(commandsOf(completed)).toEqual([
			{ type: "SETTLE_ANCHOR", name: "assets" },
			{ type: "COMMIT_ROUTER", name: "assets" },
		]);
	});

	it("lets a press take over a drag and invalidates stale gesture events", () => {
		const dragging = draggingAt("index", -0.2);
		const pressed = reduceTabPager(dragging, {
			type: "PRESS",
			name: "profile",
			reducedMotion: false,
		});
		const staleUpdate = reduceTabPager(pressed.state, {
			type: "GESTURE_UPDATE",
			transitionId: dragging.transitionId,
			displacement: -0.8,
			intentDisplacement: -0.8,
		});

		expect(pressed.state).toMatchObject({
			phase: "animating",
			targetName: "profile",
			transitionId: dragging.transitionId + 1,
		});
		expect(staleUpdate.state).toBe(pressed.state);
		expect(staleUpdate.commands).toHaveLength(0);
	});

	it("commits an adjacent gesture at the distance threshold", () => {
		const dragging = draggingAt(
			"index",
			-(GESTURE_COMMIT_DISTANCE_FRACTION + 0.01),
		);
		const result = reduceTabPager(dragging, {
			type: "GESTURE_END",
			transitionId: dragging.transitionId,
			displacement: -(GESTURE_COMMIT_DISTANCE_FRACTION + 0.01),
			intentDisplacement: -(GESTURE_COMMIT_DISTANCE_FRACTION + 0.01),
			velocity: 0,
			widthPx: 400,
			reducedMotion: false,
		});

		expect(result.state).toMatchObject({
			phase: "animating",
			targetName: "assets",
		});
		expect(commandsOf(result)).toContainEqual(
			expect.objectContaining({
				type: "ANIMATE_TO",
				displacement: -1,
			}),
		);
	});

	it("commits at the velocity threshold and returns below both thresholds", () => {
		const fast = draggingAt("index", -0.1);
		const committed = reduceTabPager(fast, {
			type: "GESTURE_END",
			transitionId: fast.transitionId,
			displacement: -0.1,
			intentDisplacement: -0.1,
			velocity: -GESTURE_COMMIT_VELOCITY_PT_PER_SEC / 400 - 0.01,
			widthPx: 400,
			reducedMotion: false,
		});
		expect(committed.state.phase).toBe("animating");

		const slow = draggingAt("index", -0.1);
		const returned = reduceTabPager(slow, {
			type: "GESTURE_END",
			transitionId: slow.transitionId,
			displacement: -0.1,
			intentDisplacement: -0.1,
			velocity: 0,
			widthPx: 400,
			reducedMotion: false,
		});
		expect(returned.state).toMatchObject({
			phase: "returning",
			targetName: null,
			ghostName: "assets",
		});
	});

	it("settles optimistically without entering a committing phase", () => {
		const animating = reduceTabPager(stateAt("index"), {
			type: "PRESS",
			name: "profile",
			reducedMotion: false,
		});
		const completed = reduceTabPager(animating.state, {
			type: "ANIMATION_COMPLETE",
			transitionId: animating.state.transitionId,
		});

		expect(completed.state).toMatchObject({
			phase: "idle",
			anchorName: "profile",
			targetName: null,
			ghostName: null,
		});
		expect(commandsOf(completed)).toEqual([
			{ type: "SETTLE_ANCHOR", name: "profile" },
			{ type: "COMMIT_ROUTER", name: "profile" },
		]);
	});

	it("ignores stale animation completion after a takeover", () => {
		const first = reduceTabPager(stateAt("index"), {
			type: "PRESS",
			name: "stats",
			reducedMotion: false,
		});
		const second = reduceTabPager(first.state, {
			type: "PRESS",
			name: "profile",
			reducedMotion: false,
		});
		const stale = reduceTabPager(second.state, {
			type: "ANIMATION_COMPLETE",
			transitionId: first.state.transitionId,
		});

		expect(stale.state).toBe(second.state);
		expect(stale.commands).toHaveLength(0);
	});

	it("snaps and commits immediately with reduced motion", () => {
		const result = reduceTabPager(stateAt("index"), {
			type: "PRESS",
			name: "profile",
			reducedMotion: true,
		});

		expect(result.state).toMatchObject({ phase: "idle", anchorName: "profile" });
		expect(commandsOf(result)).toEqual([
			{ type: "CANCEL_ANIMATION" },
			{ type: "SETTLE_ANCHOR", name: "profile" },
			{ type: "COMMIT_ROUTER", name: "profile" },
		]);
	});

	it("aligns immediately to authoritative external navigation", () => {
		const animating = reduceTabPager(stateAt("index"), {
			type: "PRESS",
			name: "stats",
			reducedMotion: false,
		});
		const external = reduceTabPager(animating.state, {
			type: "EXTERNAL_NAVIGATION",
			name: "profile",
		});

		expect(external.state).toMatchObject({
			phase: "idle",
			anchorName: "profile",
			transitionId: 2,
		});
		expect(commandsOf(external)).toEqual([
			{ type: "CANCEL_ANIMATION" },
			{ type: "SETTLE_ANCHOR", name: "profile" },
		]);
	});

	it("clamps middle tabs and damps outward edge drags", () => {
		expect(clampDragDisplacement(canonicalTabIndex("assets"), 3)).toBe(1);
		expect(clampDragDisplacement(canonicalTabIndex("assets"), -3)).toBe(-1);
		expect(clampDragDisplacement(canonicalTabIndex("index"), 0.8)).toBe(0.4);
		expect(clampDragDisplacement(canonicalTabIndex("profile"), -0.8)).toBe(
			-0.4,
		);
	});
});

describe("mountedTabNames", () => {
	function stateOf(
		anchorName: TabRouteName,
		extra?: Partial<TabPagerState>,
	): TabPagerState {
		return { ...INITIAL_TAB_PAGER_STATE, anchorName, ...extra };
	}

	it("mounts the anchor and its neighbours only", () => {
		expect(mountedTabNames(stateOf("index"))).toEqual(["index", "assets"]);
		expect(mountedTabNames(stateOf("profile"))).toEqual(["stats", "profile"]);
	});

	it("always covers what a gesture can reveal from the anchor", () => {
		// Gesture.Pan().onStart reveals neighbours synchronously on the UI thread,
		// so every neighbour must already be in the mounted set.
		for (const { name } of TAB_DEFINITIONS) {
			const mounted = mountedTabNames(stateOf(name));
			const anchorIndex = canonicalTabIndex(name);
			for (const { name: other } of TAB_DEFINITIONS) {
				if (Math.abs(canonicalTabIndex(other) - anchorIndex) <= 1) {
					expect(mounted).toContain(other);
				}
			}
		}
	});

	it("includes an in-flight target and ghost", () => {
		expect(
			mountedTabNames(stateOf("index", { targetName: "profile" })),
		).toContain("profile");
		expect(mountedTabNames(stateOf("index", { ghostName: "stats" }))).toContain(
			"stats",
		);
	});

	it("covers the target's neighbours, since the target becomes the next anchor", () => {
		// A swipe started as the animation lands would otherwise race React for stats.
		expect(mountedTabNames(stateOf("index", { targetName: "assets" }))).toEqual([
			"index",
			"assets",
			"stats",
		]);
	});

	it("keeps previously mounted scenes and preserves visual order", () => {
		expect(mountedTabNames(stateOf("index"), ["profile"])).toEqual([
			"index",
			"assets",
			"profile",
		]);
	});
});
