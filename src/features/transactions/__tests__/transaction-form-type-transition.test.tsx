import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import * as Reanimated from "react-native-reanimated";
import { TransactionForm } from "../components/TransactionForm";

jest.mock("react-native-reanimated", () => {
	const actual = jest.requireActual("react-native-reanimated");
	return {
		...actual,
		__esModule: true,
		default: actual.default,
		withTiming: <T,>(toValue: T) => toValue,
	};
});

jest.mock("expo-router/react-navigation", () => ({
	usePreventRemove: jest.fn(),
}));

jest.mock("@/features/accounts", () => ({
	useAccountBalances: () => ({ data: [], isFetched: true }),
}));

jest.mock("@/features/categories", () => ({
	useCategoryTree: () => ({ data: [], isFetched: true }),
}));

jest.mock("@/features/projects", () => ({
	useProjects: () => ({ data: [], isFetched: true }),
}));

jest.mock("@/features/currency", () => ({
	useRates: () => ({ data: { rates: {} }, isFetched: true }),
}));

jest.mock("@/features/suggestions", () => ({
	orderByScore: <T,>(items: readonly T[]) => items,
	orderTree: <T,>(items: readonly T[]) => items,
	pickAutoSelect: () => null,
	pickAutoSelectId: () => null,
	pickAutoSelectTransferPair: () => null,
	transferDestinationScores: () => new Map(),
	transferSourceScores: () => new Map(),
	useAccountSuggestion: () => ({
		accountScores: new Map(),
		transferPairs: [],
	}),
	useCategorySuggestion: () => new Map(),
}));

jest.mock("@/lib/quickKeypad", () => ({
	isQuickKeypadAvailable: () => false,
	openKeypad: jest.fn(),
}));

jest.mock("../components/CategoryPickerModal", () => ({
	CategoryPickerModal: () => null,
}));

function measureCurrentPage(type: "expense" | "income" | "transfer") {
	fireEvent(screen.getByTestId(`transaction-type-page-${type}`), "layout", {
		nativeEvent: {
			layout: { x: 0, y: 0, width: 320, height: 480 },
		},
	});
}

describe("TransactionForm type transition", () => {
	beforeEach(() => jest.useFakeTimers());

	afterEach(() => {
		jest.runOnlyPendingTimers();
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it("keeps the entering page interactive and reserves the measured height", () => {
		render(<TransactionForm mode="create" onSubmit={jest.fn()} />);
		measureCurrentPage("expense");

		fireEvent.press(screen.getByRole("tab", { name: "收入" }));

		const incomePage = screen.getByTestId("transaction-type-page-income");
		expect(incomePage.props.pointerEvents).toBe("auto");
		expect(incomePage.props.accessibilityElementsHidden).toBe(false);
		expect(incomePage.props.importantForAccessibility).toBe("auto");
		expect(
			StyleSheet.flatten(screen.getByTestId("transaction-type-page-viewport").props.style)
				.minHeight,
		).toBe(480);
	});

	it("lets the latest rapid type intent replace the active transition", () => {
		render(<TransactionForm mode="create" onSubmit={jest.fn()} />);
		measureCurrentPage("expense");

		fireEvent.press(screen.getByRole("tab", { name: "收入" }));
		fireEvent.press(screen.getByRole("tab", { name: "转账" }));

		expect(screen.getByTestId("transaction-type-page-transfer")).toBeTruthy();
		expect(screen.getByRole("tab", { name: "转账" }).props.accessibilityState).toEqual({
			selected: true,
		});
	});

	it("snaps directly without retaining a snapshot when motion is reduced", () => {
		jest.spyOn(Reanimated, "useReducedMotion").mockReturnValue(true);
		render(<TransactionForm mode="create" onSubmit={jest.fn()} />);
		measureCurrentPage("expense");

		fireEvent.press(screen.getByRole("tab", { name: "收入" }));

		expect(screen.getByTestId("transaction-type-page-income").props.pointerEvents).toBe(
			"auto",
		);
		expect(
			StyleSheet.flatten(screen.getByTestId("transaction-type-page-viewport").props.style)
				.minHeight,
		).toBeUndefined();
	});
});
