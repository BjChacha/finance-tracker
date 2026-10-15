import { fireEvent, render, screen } from "@testing-library/react-native";
import type { SharedValue } from "react-native-reanimated";
import { FloatingTabBar, tabHighlightWeight } from "../tab-bar";
import type { TabRouteName } from "../tab-pager-machine";

function sharedValue<T>(value: T): SharedValue<T> {
	return {
		value,
		get: () => value,
		set: () => {},
		addListener: () => {},
		removeListener: () => {},
		modify: () => {},
	} as SharedValue<T>;
}

function renderTabBar(
	activeName: TabRouteName,
	overrides?: {
		onPillStepChange?: (step: number) => void;
		onPressTab?: (name: TabRouteName) => void;
		onLongPressTab?: (name: TabRouteName) => void;
	},
) {
	const onPillStepChange = overrides?.onPillStepChange ?? jest.fn();
	const onPressTab = overrides?.onPressTab ?? jest.fn();
	const onLongPressTab = overrides?.onLongPressTab ?? jest.fn();
	const visualTabPosition = sharedValue(0);
	const pillTranslateX = sharedValue(0);
	const utils = render(
		<FloatingTabBar
			activeName={activeName}
			visualTabPosition={visualTabPosition}
			pillTranslateX={pillTranslateX}
			onPillStepChange={onPillStepChange}
			onPressTab={onPressTab}
			onLongPressTab={onLongPressTab}
		/>,
	);
	return {
		onPillStepChange,
		onPressTab,
		onLongPressTab,
		visualTabPosition,
		pillTranslateX,
		...utils,
	};
}

describe("FloatingTabBar", () => {
	it("interpolates highlight weight from the continuous visual position", () => {
		expect(tabHighlightWeight(0, 0)).toBe(1);
		expect(tabHighlightWeight(0.25, 0)).toBe(0.75);
		expect(tabHighlightWeight(0.25, 1)).toBe(0.25);
		expect(tabHighlightWeight(0, 2)).toBe(0);
	});

	it("renders tabs in canonical order", () => {
		renderTabBar("index");
		const labels = screen
			.getAllByRole("tab")
			.map((node) => node.props.accessibilityLabel);
		expect(labels).toEqual(["\u770b\u677f", "\u6d41\u6c34", "\u6211\u7684"]);
	});

	it("derives selected accessibility state only from the visual anchor", () => {
		const { rerender, pillTranslateX, visualTabPosition } =
			renderTabBar("index");
		expect(
			screen.getAllByRole("tab")[0].props.accessibilityState.selected,
		).toBe(true);

		rerender(
			<FloatingTabBar
				activeName="profile"
				visualTabPosition={visualTabPosition}
				pillTranslateX={pillTranslateX}
				onPillStepChange={() => {}}
				onPressTab={() => {}}
				onLongPressTab={() => {}}
			/>,
		);
		expect(
			screen.getAllByRole("tab")[2].props.accessibilityState.selected,
		).toBe(true);
		expect(
			screen.getAllByRole("tab")[0].props.accessibilityState.selected,
		).toBe(false);
	});

	it("forwards the measured indicator step", () => {
		const onPillStepChange = jest.fn();
		renderTabBar("index", { onPillStepChange });

		fireEvent(screen.getByTestId("tab-bar-items"), "layout", {
			nativeEvent: { layout: { width: 320 } },
		});

		// (320 - 5*2 - 2*2) / 3 = 102, plus the 2-point item gap.
		expect(onPillStepChange).toHaveBeenLastCalledWith(104);
	});

	it("forwards press and long-press events", () => {
		const onPressTab = jest.fn();
		const onLongPressTab = jest.fn();
		renderTabBar("index", { onPressTab, onLongPressTab });

		fireEvent.press(screen.getAllByRole("tab")[2]);
		expect(onPressTab).toHaveBeenCalledWith("profile");
		fireEvent(screen.getAllByRole("tab")[1], "longPress");
		expect(onLongPressTab).toHaveBeenCalledWith("ledger");
	});
});
