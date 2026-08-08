import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { State } from "react-native-gesture-handler";
import { motion } from "@/theme/motion";
import {
	TabPagerViewport,
	useTabPagerController,
	type TabPagerController,
	type TabRouterContract,
	type TabSceneSpec,
} from "../tab-pager";
import { logicalTabSlot, type TabRouteName } from "../tab-pager-machine";

const SCENES: TabSceneSpec[] = (
	["index", "assets", "stats", "profile"] as const
).map((name) => ({
	name,
	render: () => <Text testID={`content-${name}`}>{name}</Text>,
}));

type PanHandlers = {
	onStart?: () => void;
	onUpdate?: (event: { translationX: number }) => void;
	onEnd?: (event: { translationX: number; velocityX: number }) => void;
	onFinalize?: (event: { state: number }) => void;
};

function gestureEnabled(controller: TabPagerController): boolean | undefined {
	return (controller.gesture as unknown as { config: { enabled?: boolean } }).config
		.enabled;
}

function handlersOf(controller: TabPagerController): PanHandlers {
	return controller.gesture.handlers as unknown as PanHandlers;
}

async function setup(options?: {
	activeRouteName?: TabRouteName;
	reduceMotion?: boolean;
	preventPress?: boolean;
}) {
	const jumps: TabRouteName[] = [];
	const emitted: string[] = [];
	const router: TabRouterContract = {
		routeKeyFor: (name) => `key-${name}`,
		jumpTo: (name) => jumps.push(name),
		emitTabPress: (target) => {
			emitted.push(target);
			return options?.preventPress ?? false;
		},
		emitTabLongPress: jest.fn(),
	};
	let controller: TabPagerController | null = null;

	function Harness() {
		controller = useTabPagerController({
			router,
			activeRouteName: options?.activeRouteName ?? "index",
			reduceMotion: options?.reduceMotion ?? false,
		});
		return (
			<>
				<Text testID="pager-phase">{controller.state.phase}</Text>
				<Text testID="pager-anchor">{controller.state.anchorName}</Text>
				<TabPagerViewport scenes={SCENES} controller={controller} />
			</>
		);
	}

	const utils = render(<Harness />);
	const current = (): TabPagerController => {
		if (controller === null) throw new Error("Controller was not initialized");
		return controller;
	};
	await act(async () => {
		fireEvent(screen.getByTestId("tab-pager-viewport"), "layout", {
			nativeEvent: { layout: { width: 400, height: 800 } },
		});
	});
	return { current, jumps, emitted, router, ...utils };
}

const HIDDEN = { includeHiddenElements: true } as const;

/** Inactive scenes carry accessibilityElementsHidden, so queries must opt into them. */
function contentOf(name: TabRouteName) {
	return screen.queryByTestId(`content-${name}`, HIDDEN);
}

describe("TabPager", () => {
	it("mounts only the anchor and its neighbours, keeping distant scenes unrendered", async () => {
		const { current } = await setup();

		for (const name of ["index", "assets", "stats", "profile"] as const) {
			expect(screen.getByTestId(`tab-pager-scene-${name}`, HIDDEN)).toBeTruthy();
		}
		// Neighbours must exist before a gesture can reveal them on the UI thread.
		expect(contentOf("index")).toBeTruthy();
		expect(contentOf("assets")).toBeTruthy();
		// stats/profile are not reachable without a state change, so they stay unmounted.
		expect(contentOf("stats")).toBeNull();
		expect(contentOf("profile")).toBeNull();

		expect(current().opacityFor("index").value).toBe(1);
		expect(current().opacityFor("assets").value).toBe(1);
		expect(current().opacityFor("stats").value).toBe(0);
		expect(current().opacityFor("profile").value).toBe(0);
	});

	it("mounts a non-adjacent target in the same commit that makes it visible", async () => {
		const { current } = await setup();
		expect(contentOf("profile")).toBeNull();

		await act(async () => current().pressTab("profile"));

		expect(current().opacityFor("profile").value).toBe(1);
		expect(contentOf("profile")).toBeTruthy();
	});

	it("mounts the next neighbour once the anchor moves", async () => {
		const { current } = await setup();
		expect(contentOf("stats")).toBeNull();

		await act(async () => current().pressTab("assets"));

		expect(contentOf("stats")).toBeTruthy();
	});

	it("keeps scenes mounted after they stop being reachable", async () => {
		const { current } = await setup({ activeRouteName: "profile" });
		expect(contentOf("stats")).toBeTruthy();

		await act(async () => current().pressTab("index"));

		// Remounting would drop scroll position and re-run the screen's queries.
		expect(contentOf("stats")).toBeTruthy();
	});

	it("keeps the clipping viewport fixed and places distant routes in one slot", async () => {
		await setup();

		const viewportStyle = StyleSheet.flatten(
			screen.getByTestId("tab-pager-viewport").props.style,
		);
		expect(viewportStyle.transform).toBeUndefined();

		expect([0, 1, 2, 3].map((sceneIndex) => logicalTabSlot(0, sceneIndex))).toEqual([
			0, 1, 1, 1,
		]);
		expect([0, 1, 2, 3].map((sceneIndex) => logicalTabSlot(3, sceneIndex))).toEqual([
			-1, -1, -1, 0,
		]);
	});

	it("shows only the selected non-adjacent target during a program transition", async () => {
		const { current } = await setup();

		await act(async () => current().pressTab("profile"));

		expect(screen.getByTestId("pager-phase").props.children).toBe("animating");
		expect(current().opacityFor("index").value).toBe(1);
		expect(current().opacityFor("assets").value).toBe(0);
		expect(current().opacityFor("stats").value).toBe(0);
		expect(current().opacityFor("profile").value).toBe(1);
	});

	it("keeps the real gesture enabled while a program animation is active", async () => {
		const { current } = await setup();

		await act(async () => current().pressTab("profile"));

		expect(current().state.phase).toBe("animating");
		expect(gestureEnabled(current())).toBe(true);
	});

	it("switches visibility to adjacent scenes synchronously when gesture takes over", async () => {
		const { current } = await setup();
		await act(async () => current().pressTab("assets"));

		const handlers = handlersOf(current());
		await act(async () => handlers.onStart?.());

		expect(current().state).toMatchObject({
			phase: "dragging",
			anchorName: "assets",
		});
		expect(current().opacityFor("index").value).toBe(1);
		expect(current().opacityFor("assets").value).toBe(1);
		expect(current().opacityFor("stats").value).toBe(1);
		expect(current().opacityFor("profile").value).toBe(0);
	});

	it("rebases an active transition onto its target without moving visible scenes", async () => {
		const { current } = await setup();
		await act(async () => current().pressTab("assets"));
		await act(async () => {
			current().translateX.value = -240;
		});

		const width = current().viewportWidthValue.value;
		const indexBefore =
			logicalTabSlot(current().anchorIndex.value, 0) * width +
			current().translateX.value;
		const assetsBefore =
			logicalTabSlot(current().anchorIndex.value, 1) * width +
			current().translateX.value;

		await act(async () => handlersOf(current()).onStart?.());

		const indexAfter =
			logicalTabSlot(current().anchorIndex.value, 0) * width +
			current().translateX.value;
		const assetsAfter =
			logicalTabSlot(current().anchorIndex.value, 1) * width +
			current().translateX.value;
		expect(current().state).toMatchObject({
			phase: "dragging",
			anchorName: "assets",
			targetName: null,
		});
		expect(current().anchorIndex.value).toBe(1);
		expect(current().translateX.value).toBe(160);
		expect(indexAfter).toBe(indexBefore);
		expect(assetsAfter).toBe(assetsBefore);
	});

	it("accepts three same-direction swipes without waiting for animations", async () => {
		jest.useFakeTimers();
		try {
			const { current, jumps } = await setup();
			act(() => {
				jest.advanceTimersByTime(20);
			});

			for (const targetName of ["assets", "stats", "profile"] as const) {
				const handlers = handlersOf(current());
				act(() => {
					handlers.onStart?.();
					handlers.onUpdate?.({ translationX: -160 });
					handlers.onEnd?.({ translationX: -160, velocityX: 0 });
					jest.runAllTicks();
				});
				expect(current().state).toMatchObject({
					phase: "animating",
					targetName,
				});
				act(() => {
					jest.advanceTimersByTime(20);
				});
			}

			expect(current().state).toMatchObject({
				anchorName: "stats",
				targetName: "profile",
			});
			expect(jumps).toEqual([]);

			await act(async () => {
				jest.advanceTimersByTime(motion.tab + 20);
				jest.runAllTicks();
			});

			expect(current().state).toMatchObject({
				phase: "idle",
				anchorName: "profile",
			});
			expect(jumps).toEqual(["profile"]);
		} finally {
			jest.runOnlyPendingTimers();
			jest.useRealTimers();
		}
	});

	it("uses a distant press target as the anchor for an immediate swipe", async () => {
		const { current } = await setup();
		await act(async () => current().pressTab("profile"));
		const handlers = handlersOf(current());

		await act(async () => {
			handlers.onStart?.();
			handlers.onUpdate?.({ translationX: 160 });
		});

		expect(current().state).toMatchObject({
			phase: "dragging",
			anchorName: "profile",
			targetName: "stats",
		});
	});

	it("prevents stale pan updates from overwriting a press takeover", async () => {
		const { current } = await setup();
		const handlers = handlersOf(current());
		await act(async () => {
			handlers.onStart?.();
			handlers.onUpdate?.({ translationX: -80 });
		});
		expect(current().translateX.value).toBe(-80);

		await act(async () => current().pressTab("profile"));
		await waitFor(() => expect(current().opacityFor("profile").value).toBe(1));
		await act(async () => handlers.onUpdate?.({ translationX: 240 }));

		// A stale positive update would write +80 at the left edge. The active
		// program transition must retain its negative direction instead.
		expect(current().translateX.value).toBeLessThan(0);
	});

	it("preserves normalized drag progress when the viewport width changes", async () => {
		const { current } = await setup();
		const handlers = handlersOf(current());
		await act(async () => {
			handlers.onStart?.();
			handlers.onUpdate?.({ translationX: -80 });
		});
		expect(current().translateX.value).toBe(-80);

		await act(async () => {
			fireEvent(screen.getByTestId("tab-pager-viewport"), "layout", {
				nativeEvent: { layout: { width: 800, height: 800 } },
			});
		});

		expect(current().state.displacement).toBe(-0.2);
		await waitFor(() => expect(current().translateX.value).toBe(-160));
	});

	it("does not start a transition when tabPress is prevented", async () => {
		const { current, jumps, emitted } = await setup({ preventPress: true });

		await act(async () => current().pressTab("profile"));

		expect(emitted).toEqual(["key-profile"]);
		expect(current().state).toMatchObject({
			phase: "idle",
			anchorName: "index",
		});
		expect(jumps).toEqual([]);
	});

	it("commits exactly once after the visual timing settles", async () => {
		jest.useFakeTimers();
		try {
			const { current, jumps } = await setup();
			await act(async () => {
				current().pressTab("profile");
				jest.advanceTimersByTime(1);
			});
			expect(jumps).toEqual([]);

			await act(async () => {
				jest.advanceTimersByTime(motion.tab + 20);
			});

			expect(current().state).toMatchObject({
				phase: "idle",
				anchorName: "profile",
			});
			expect(current().anchorIndex.value).toBe(3);
			expect(current().translateX.value).toBe(0);
			expect(jumps).toEqual(["profile"]);
		} finally {
			jest.runOnlyPendingTimers();
			jest.useRealTimers();
		}
	});

	it("ignores superseded internal router confirmations", async () => {
		const { current, jumps } = await setup({ reduceMotion: true });

		await act(async () => current().pressTab("profile"));
		await act(async () => current().pressTab("stats"));
		expect(current().state.anchorName).toBe("stats");
		// Router writes are serialized so confirmations are never ambiguous.
		expect(jumps).toEqual(["profile"]);

		await act(async () => current().syncRouterState("profile"));
		expect(current().state.anchorName).toBe("stats");
		expect(jumps).toEqual(["profile", "stats"]);
		await act(async () => current().syncRouterState("stats"));
		expect(current().state.anchorName).toBe("stats");
	});

	it("keeps visual and router state aligned through twenty alternating intents", async () => {
		const { current, jumps } = await setup({ reduceMotion: true });
		const expectedCycle = ["profile", "stats", "index", "assets"] as const;
		let expectedJumpCount = 0;
		const confirmRouter = async (name: TabRouteName) => {
			expectedJumpCount += 1;
			await waitFor(() => expect(jumps).toHaveLength(expectedJumpCount));
			await act(async () => current().syncRouterState(name));
		};

		for (let cycle = 0; cycle < 5; cycle += 1) {
			await act(async () => current().pressTab("profile"));
			expect(current().state.anchorName).toBe("profile");
			await confirmRouter("profile");

			let handlers = handlersOf(current());
			await act(async () => {
				handlers.onStart?.();
				handlers.onUpdate?.({ translationX: 200 });
				handlers.onEnd?.({ translationX: 200, velocityX: 0 });
			});
			expect(current().state.anchorName).toBe("stats");
			await confirmRouter("stats");

			await act(async () => current().pressTab("index"));
			expect(current().state.anchorName).toBe("index");
			await confirmRouter("index");

			handlers = handlersOf(current());
			await act(async () => {
				handlers.onStart?.();
				handlers.onUpdate?.({ translationX: -200 });
				handlers.onEnd?.({ translationX: -200, velocityX: 0 });
			});
			expect(current().state.anchorName).toBe("assets");
			await confirmRouter("assets");
		}

		expect(jumps).toEqual(Array.from({ length: 5 }, () => expectedCycle).flat());
		expect(current().state).toMatchObject({
			phase: "idle",
			anchorName: "assets",
		});
		expect(current().anchorIndex.value).toBe(1);
		expect(current().translateX.value).toBe(0);
	});

	it("treats a route outside the internal queue as authoritative", async () => {
		const { current } = await setup();
		await act(async () => current().pressTab("profile"));

		await act(async () => current().syncRouterState("assets"));

		expect(current().state).toMatchObject({
			phase: "idle",
			anchorName: "assets",
		});
		await waitFor(() => expect(current().opacityFor("assets").value).toBe(1));
		expect(current().opacityFor("index").value).toBe(1);
		expect(current().opacityFor("assets").value).toBe(1);
		expect(current().opacityFor("stats").value).toBe(1);
		expect(current().opacityFor("profile").value).toBe(0);
	});

	it("keeps mounted scene state after visual route changes", () => {
		function Counter() {
			const [count, setCount] = useState(0);
			return (
				<Text testID="counter" onPress={() => setCount((value) => value + 1)}>
					{count}
				</Text>
			);
		}

		const scenes: TabSceneSpec[] = [
			{ name: "index", render: () => <Counter /> },
			...SCENES.slice(1),
		];
		const router: TabRouterContract = {
			routeKeyFor: (name) => name,
			jumpTo: () => {},
			emitTabPress: () => false,
			emitTabLongPress: () => {},
		};
		let controller: TabPagerController | null = null;
		function Harness() {
			controller = useTabPagerController({
				router,
				activeRouteName: "index",
				reduceMotion: true,
			});
			return <TabPagerViewport scenes={scenes} controller={controller} />;
		}
		render(<Harness />);

		fireEvent.press(screen.getByTestId("counter"));
		expect(screen.getByTestId("counter").props.children).toBe(1);
		act(() => controller?.pressTab("profile"));
		act(() => controller?.pressTab("index"));
		expect(screen.getByTestId("counter").props.children).toBe(1);
	});

	it("finalizes cancelled gestures through the current gesture session only", async () => {
		const { current } = await setup();
		const handlers = handlersOf(current());
		await act(async () => {
			handlers.onStart?.();
			handlers.onUpdate?.({ translationX: -40 });
			handlers.onFinalize?.({ state: State.CANCELLED });
		});
		expect(current().state.phase).toBe("returning");
	});
});
