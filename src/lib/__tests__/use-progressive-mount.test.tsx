import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { useProgressiveMount } from "../use-progressive-mount";

function ProgressiveMountHarness({ enabled }: { enabled: boolean }) {
	const stage = useProgressiveMount(enabled, 3);
	return <Text testID="stage">{stage}</Text>;
}

describe("useProgressiveMount", () => {
	beforeEach(() => {
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
});
