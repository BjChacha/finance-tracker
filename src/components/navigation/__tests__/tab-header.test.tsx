import { fireEvent, render, screen } from "@testing-library/react-native";
import type { SharedValue } from "react-native-reanimated";
import { TabHeader, tabHeaderTranslateX } from "../tab-header";
import type {
	TabPagerPhase,
	TabRouteName,
} from "../tab-pager-machine";

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

function renderHeader(
	activeName: TabRouteName,
	phase: TabPagerPhase = "idle",
) {
	const onSearch = jest.fn();
	const onAddAccount = jest.fn();
	const opacities = {
		index: sharedValue(1),
		assets: sharedValue(1),
		stats: sharedValue(0),
		profile: sharedValue(0),
	};
	const utils = render(
		<TabHeader
			activeName={activeName}
			phase={phase}
			anchorIndex={sharedValue(activeName === "assets" ? 1 : 0)}
			translateX={sharedValue(0)}
			viewportWidth={sharedValue(360)}
			opacityFor={(name) => opacities[name]}
			onSearch={onSearch}
			onAddAccount={onAddAccount}
		/>,
	);
	return { onSearch, onAddAccount, ...utils };
}

describe("TabHeader", () => {
	it("uses the pager slot model for adjacent and distant titles", () => {
		expect(tabHeaderTranslateX(0, 0, 360, -90)).toBe(-90);
		expect(tabHeaderTranslateX(0, 1, 360, -90)).toBe(270);
		expect(tabHeaderTranslateX(0, 3, 360, -90)).toBe(270);
		expect(tabHeaderTranslateX(2, 0, 360, 45)).toBe(-315);
	});

	it("renders all title layers but exposes only the visual anchor", () => {
		renderHeader("index");

		expect(
			screen.getByTestId("tab-header-layer-index").props
				.accessibilityElementsHidden,
		).toBe(false);
		expect(
			screen.getByTestId("tab-header-layer-assets", {
				includeHiddenElements: true,
			}).props.accessibilityElementsHidden,
		).toBe(true);
		expect(
			screen.getByTestId("tab-header-layer-stats", {
				includeHiddenElements: true,
			}),
		).toBeTruthy();
		expect(
			screen.getByTestId("tab-header-layer-profile", {
				includeHiddenElements: true,
			}),
		).toBeTruthy();
	});

	it("binds actions to their title layer and disables moving actions", () => {
		const { onSearch, onAddAccount, rerender } = renderHeader("index");
		const search = screen.getByLabelText("搜索交易");
		fireEvent.press(search);
		expect(onSearch).toHaveBeenCalledTimes(1);

		const opacities = {
			index: sharedValue(1),
			assets: sharedValue(1),
			stats: sharedValue(0),
			profile: sharedValue(0),
		};
		rerender(
			<TabHeader
				activeName="assets"
				phase="animating"
				anchorIndex={sharedValue(0)}
				translateX={sharedValue(-180)}
				viewportWidth={sharedValue(360)}
				opacityFor={(name) => opacities[name]}
				onSearch={onSearch}
				onAddAccount={onAddAccount}
			/>,
		);

		expect(
			screen.getByLabelText("新增账户").props.accessibilityState?.disabled ??
				screen.getByLabelText("新增账户").props.disabled,
		).toBe(true);
		fireEvent.press(screen.getByLabelText("新增账户"));
		expect(onAddAccount).not.toHaveBeenCalled();
	});
});
