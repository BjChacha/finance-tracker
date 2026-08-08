import { act, fireEvent, render } from "@testing-library/react-native";
import { useRootNavigationState } from "expo-router";
import { View } from "react-native";
import { useAppLaunchGate } from "@/components/navigation/app-launch-gate";
import { completeAppLaunch } from "@/lib/quickKeypad";

jest.mock("expo-router", () => ({
	useRootNavigationState: jest.fn(),
}));

jest.mock("@/lib/quickKeypad", () => ({
	completeAppLaunch: jest.fn(),
}));

const useRootNavigationStateMock = useRootNavigationState as jest.Mock;
const completeAppLaunchMock = completeAppLaunch as jest.MockedFunction<
	typeof completeAppLaunch
>;

function AppLaunchGateHarness({
	navigationFallbackReady = false,
}: {
	navigationFallbackReady?: boolean;
}) {
	const onLayout = useAppLaunchGate({ navigationFallbackReady });
	return <View testID="app-root" onLayout={onLayout} />;
}

function emitRootLayout(view: ReturnType<typeof render>) {
	fireEvent(view.getByTestId("app-root"), "layout", {
		nativeEvent: {
			layout: { x: 0, y: 0, width: 400, height: 800 },
		},
	});
}

describe("useAppLaunchGate", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		useRootNavigationStateMock.mockReturnValue(undefined);
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

	it("waits for navigation, root layout, and two committed frames", () => {
		const view = render(<AppLaunchGateHarness />);
		emitRootLayout(view);
		act(() => jest.advanceTimersByTime(64));
		expect(completeAppLaunchMock).not.toHaveBeenCalled();

		useRootNavigationStateMock.mockReturnValue({ key: "root" });
		view.rerender(<AppLaunchGateHarness />);
		expect(completeAppLaunchMock).not.toHaveBeenCalled();

		act(() => jest.advanceTimersByTime(16));
		expect(completeAppLaunchMock).not.toHaveBeenCalled();

		act(() => jest.advanceTimersByTime(16));
		expect(completeAppLaunchMock).toHaveBeenCalledTimes(1);
	});

	it("does not start the frame wait before the root layout", () => {
		useRootNavigationStateMock.mockReturnValue({ key: "root" });
		render(<AppLaunchGateHarness />);

		act(() => jest.advanceTimersByTime(64));
		expect(completeAppLaunchMock).not.toHaveBeenCalled();
	});

	it("uses the fallback readiness path for the migration error screen", () => {
		const view = render(<AppLaunchGateHarness navigationFallbackReady />);
		emitRootLayout(view);

		act(() => jest.advanceTimersByTime(16));
		expect(completeAppLaunchMock).not.toHaveBeenCalled();
		act(() => jest.advanceTimersByTime(16));
		expect(completeAppLaunchMock).toHaveBeenCalledTimes(1);
	});

	it("notifies native only once for one mounted root", () => {
		useRootNavigationStateMock.mockReturnValue({ key: "root" });
		const view = render(<AppLaunchGateHarness />);
		emitRootLayout(view);
		act(() => jest.advanceTimersByTime(32));

		emitRootLayout(view);
		view.rerender(<AppLaunchGateHarness />);
		act(() => jest.advanceTimersByTime(64));
		expect(completeAppLaunchMock).toHaveBeenCalledTimes(1);
	});

	it("cancels the second frame when the root unmounts", () => {
		useRootNavigationStateMock.mockReturnValue({ key: "root" });
		const view = render(<AppLaunchGateHarness />);
		emitRootLayout(view);
		act(() => jest.advanceTimersByTime(16));

		view.unmount();
		act(() => jest.advanceTimersByTime(32));
		expect(completeAppLaunchMock).not.toHaveBeenCalled();
	});
});
