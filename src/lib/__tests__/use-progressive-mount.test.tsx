import { act, render, screen } from "@testing-library/react-native";
import { AppState, Text } from "react-native";
import { useProgressiveMount } from "../use-progressive-mount";

function ProgressiveMountHarness({ enabled }: { enabled: boolean }) {
	const stage = useProgressiveMount(enabled, 3);
	return <Text testID="stage">{stage}</Text>;
}

describe("useProgressiveMount", () => {
	let appStateListeners: Array<(state: string) => void> = [];

	beforeEach(() => {
		appStateListeners = [];
		jest.spyOn(AppState, "addEventListener").mockImplementation(
			(_event, listener) => {
				appStateListeners.push(listener as (state: string) => void);
				return { remove: jest.fn() } as unknown as ReturnType<
					typeof AppState.addEventListener
				>;
			},
		);
		jest.useFakeTimers();
		jest.spyOn(global, "requestAnimationFrame").mockImplementation((callback) =>
			setTimeout(() => callback(Date.now()), 16) as unknown as number,
		);
		jest.spyOn(global, "cancelAnimationFrame").mockImplementation((handle) => {
			clearTimeout(handle);
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
		jest.useRealTimers();
	});

	it("mounts one stage per frame after the summary mode ends", () => {
		const view = render(<ProgressiveMountHarness enabled={false} />);
		expect(screen.getByTestId("stage").props.children).toBe(0);

		view.rerender(<ProgressiveMountHarness enabled />);
		expect(screen.getByTestId("stage").props.children).toBe(1);

		act(() => jest.advanceTimersByTime(16));
		expect(screen.getByTestId("stage").props.children).toBe(2);

		act(() => jest.advanceTimersByTime(16));
		expect(screen.getByTestId("stage").props.children).toBe(3);
	});

	it("cancels pending stages when summary mode returns", () => {
		const view = render(<ProgressiveMountHarness enabled />);
		view.rerender(<ProgressiveMountHarness enabled={false} />);

		expect(screen.getByTestId("stage").props.children).toBe(0);
		act(() => jest.advanceTimersByTime(48));
		expect(screen.getByTestId("stage").props.children).toBe(0);
	});

	it("re-kicks the frame chain when the app returns to the foreground", () => {
		// Drive frames through a controllable queue so a pending rAF callback can be
		// "dropped" exactly like the OS drops vsync callbacks while backgrounded.
		let frameQueue: Array<() => void> = [];
		jest.spyOn(global, "requestAnimationFrame").mockImplementation((callback) => {
			frameQueue.push(() => callback(Date.now()));
			return frameQueue.length;
		});
		jest.spyOn(global, "cancelAnimationFrame").mockImplementation(() => {});
		const flushFrames = () =>
			act(() => {
				const pending = frameQueue;
				frameQueue = [];
				pending.forEach((flush) => flush());
			});
		const dropFrames = () => {
			frameQueue = [];
		};
		const emitAppState = (state: string) =>
			act(() => {
				appStateListeners.forEach((listener) => listener(state));
			});

		render(<ProgressiveMountHarness enabled />);
		expect(screen.getByTestId("stage").props.children).toBe(1);

		flushFrames();
		expect(screen.getByTestId("stage").props.children).toBe(2);

		// Simulate backgrounding: the pending frame callback never runs.
		dropFrames();
		emitAppState("active");

		flushFrames();
		expect(screen.getByTestId("stage").props.children).toBe(3);
	});
});
