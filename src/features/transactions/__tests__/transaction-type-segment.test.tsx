import { fireEvent, render, screen } from "@testing-library/react-native";
import type { SharedValue } from "react-native-reanimated";
import {
	TransactionTypeSegment,
	transactionTypeHighlightWeight,
} from "../components/TransactionTypeSegment";

function sharedValue(value: number): SharedValue<number> {
	return {
		value,
		get: () => value,
		set: () => {},
		addListener: () => {},
		removeListener: () => {},
		modify: () => {},
	} as SharedValue<number>;
}

describe("TransactionTypeSegment", () => {
	it("interpolates the active label from the continuous type position", () => {
		expect(transactionTypeHighlightWeight(0, 0)).toBe(1);
		expect(transactionTypeHighlightWeight(0.4, 0)).toBe(0.6);
		expect(transactionTypeHighlightWeight(0.4, 1)).toBe(0.4);
		expect(transactionTypeHighlightWeight(0, 2)).toBe(0);
	});

	it("renders canonical tabs and forwards the selected type", () => {
		const onSelect = jest.fn();
		render(
			<TransactionTypeSegment
				type="expense"
				visualPosition={sharedValue(0)}
				onSelect={onSelect}
			/>,
		);

		const tabs = screen.getAllByRole("tab");
		expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual([
			"支出",
			"收入",
			"转账",
		]);
		expect(tabs[0].props.accessibilityState.selected).toBe(true);

		fireEvent.press(tabs[2]);
		expect(onSelect).toHaveBeenCalledWith("transfer");
	});

	it("mounts one measured moving indicator", () => {
		render(
			<TransactionTypeSegment
				type="income"
				visualPosition={sharedValue(1)}
				onSelect={() => {}}
			/>,
		);

		fireEvent(screen.getByTestId("transaction-type-segment"), "layout", {
			nativeEvent: { layout: { width: 308 } },
		});

		expect(screen.getByTestId("transaction-type-indicator")).toBeTruthy();
		expect(
			screen.getByTestId("transaction-type-tab-income").props
				.accessibilityState.selected,
		).toBe(true);
	});
});
