import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useCallback, useEffect, useState } from "react";
import { Text } from "react-native";
import {
	SecondarySheetScreen,
	SecondarySheetSurface,
} from "../secondary-sheet-screen";

const mockRouterBack = jest.fn();

jest.mock("expo-router", () => {
	const React = jest.requireActual<typeof import("react")>("react");
	return {
		useRouter: () => ({ back: mockRouterBack }),
		useFocusEffect: (effect: () => void | (() => void)) =>
			React.useEffect(effect, [effect]),
	};
});

function DeferredContentHarness(props: {
	onEntered: () => void;
	skipEntryAnimation?: boolean;
}) {
	const [entered, setEntered] = useState(false);
	const handleEntered = useCallback(() => {
		props.onEntered();
		setEntered(true);
	}, [props.onEntered]);

	return (
		<SecondarySheetScreen
			title="Details"
			onEntered={handleEntered}
			skipEntryAnimation={props.skipEntryAnimation}
		>
			{entered ? (
				<Text testID="heavy-content">Heavy content</Text>
			) : (
				<Text testID="business-summary">Business summary</Text>
			)}
		</SecondarySheetScreen>
	);
}

describe("SecondarySheetScreen entry barrier", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		mockRouterBack.mockClear();
		jest.spyOn(global, "requestAnimationFrame").mockImplementation((callback) =>
			setTimeout(() => callback(Date.now()), 16) as unknown as number,
		);
		jest.spyOn(global, "cancelAnimationFrame").mockImplementation((handle) => {
			clearTimeout(handle);
		});
	});

	afterEach(() => {
		jest.runOnlyPendingTimers();
		jest.restoreAllMocks();
		jest.useRealTimers();
	});

	it("keeps the business summary visible until the measured entry animation completes", () => {
		const onEntered = jest.fn();
		render(<DeferredContentHarness onEntered={onEntered} />);

		expect(screen.getByTestId("business-summary")).toBeTruthy();
		expect(screen.queryByTestId("heavy-content")).toBeNull();

		fireEvent(screen.getByTestId("secondary-sheet-card"), "layout", {
			nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
		});
		expect(onEntered).not.toHaveBeenCalled();

		act(() => {
			jest.runAllTimers();
		});

		expect(onEntered).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId("heavy-content")).toBeTruthy();
		expect(screen.queryByTestId("business-summary")).toBeNull();
	});

	it("does not start a delayed entry after an immediate dismiss", async () => {
		const onEntered = jest.fn();
		render(<DeferredContentHarness onEntered={onEntered} />);

		fireEvent(screen.getByTestId("secondary-sheet-card"), "layout", {
			nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
		});
		await act(async () => {
			fireEvent.press(screen.getAllByLabelText("\u5173\u95ED")[0]);
			await Promise.resolve();
		});

		act(() => {
			jest.runAllTimers();
		});

		expect(onEntered).not.toHaveBeenCalled();
		expect(screen.queryByTestId("heavy-content")).toBeNull();
		expect(mockRouterBack).toHaveBeenCalledTimes(1);
	});

	it("commits an animation-free entry on the first frame after layout", () => {
		const onEntered = jest.fn();
		render(
			<DeferredContentHarness
				onEntered={onEntered}
				skipEntryAnimation
			/>,
		);

		fireEvent(screen.getByTestId("secondary-sheet-card"), "layout", {
			nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
		});
		expect(onEntered).not.toHaveBeenCalled();

		act(() => {
			jest.advanceTimersByTime(16);
		});

		expect(onEntered).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId("heavy-content")).toBeTruthy();

		fireEvent(screen.getByTestId("secondary-sheet-card"), "layout", {
			nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
		});
		act(() => {
			jest.runAllTimers();
		});
		expect(onEntered).toHaveBeenCalledTimes(1);
	});

	it("hands a still-visible sheet directly to the system exit action", async () => {
		const onDismiss = jest.fn();
		render(
			<SecondarySheetScreen
				title="Details"
				onDismiss={onDismiss}
				skipEntryAnimation
				skipExitAnimation
			>
				<Text testID="quick-add-content">Quick add</Text>
			</SecondarySheetScreen>,
		);

		fireEvent(screen.getByTestId("secondary-sheet-card"), "layout", {
			nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
		});
		await act(async () => {
			fireEvent.press(screen.getAllByLabelText("\u5173\u95ED")[0]);
			await Promise.resolve();
		});

		expect(onDismiss).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId("quick-add-content")).toBeTruthy();
	});

	it("keeps controlled surface content mounted across open and close transitions", () => {
		const onEntered = jest.fn();
		const onExited = jest.fn();
		const onMount = jest.fn();
		const onUnmount = jest.fn();

		function MountProbe() {
			useEffect(() => {
				onMount();
				return onUnmount;
			}, []);
			return <Text testID="resident-editor">Resident editor</Text>;
		}

		const renderSurface = (visible: boolean) => (
			<SecondarySheetSurface
				visible={visible}
				title="Details"
				onRequestDismiss={jest.fn()}
				onEntered={onEntered}
				onExited={onExited}
			>
				<MountProbe />
			</SecondarySheetSurface>
		);

		const view = render(renderSurface(false));
		fireEvent(screen.getByTestId("secondary-sheet-card"), "layout", {
			nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
		});
		expect(onMount).toHaveBeenCalledTimes(1);

		view.rerender(renderSurface(true));
		act(() => jest.runAllTimers());
		expect(onEntered).toHaveBeenCalledTimes(1);

		view.rerender(renderSurface(false));
		act(() => jest.runAllTimers());
		expect(onExited).toHaveBeenCalledTimes(1);
		expect(onMount).toHaveBeenCalledTimes(1);
		expect(onUnmount).not.toHaveBeenCalled();
		expect(screen.getByTestId("resident-editor")).toBeTruthy();
	});
});
