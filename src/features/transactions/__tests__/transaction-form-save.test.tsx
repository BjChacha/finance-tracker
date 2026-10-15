import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import { Alert, Keyboard } from "react-native";
import { zh } from "@/i18n/zh";
import { formLabels } from "@/components/form/labels";

import { TransactionForm, type TransactionFormHandle } from "../components/TransactionForm";

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


const initial = {
  type: "expense" as const,
  amount: 1234,
  fee: 0,
  accountId: "account-1",
  categoryId: "category-1",
  note: "Original",
  dateMs: new Date(2026, 9, 15, 12).getTime(),
};

describe("Transaction editor submission", () => {
  afterEach(() => jest.restoreAllMocks());

  it("saves the current note from the bottom action and dismisses the keyboard in one tap", async () => {
    const submit = jest.fn().mockResolvedValue(undefined);
    const saved = jest.fn();
    jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
    render(<TransactionForm mode="edit" initialValues={initial} onSubmit={submit} onSaved={saved} />);
    fireEvent.changeText(screen.getByPlaceholderText(zh.tx.notePlaceholder), "Updated");
    await act(async () => fireEvent.press(screen.getByTestId("transaction-save")));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ note: "Updated", amount: 1234 }));
    expect(Keyboard.dismiss).toHaveBeenCalled();
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it("prevents concurrent submissions while persistence is pending", async () => {
    let complete!: () => void;
    const submit = jest.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
    const ref = createRef<TransactionFormHandle>();
    render(<TransactionForm ref={ref} mode="edit" initialValues={initial} onSubmit={submit} />);
    let first!: Promise<boolean>;
    await act(async () => {
      first = ref.current!.save();
      expect(await ref.current!.save()).toBe(false);
    });
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => { complete(); await first; });
  });

  it("keeps edits and reports a failed save without closing", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const submit = jest.fn().mockRejectedValue(new Error("Storage unavailable"));
    const saved = jest.fn();
    render(<TransactionForm mode="edit" initialValues={initial} onSubmit={submit} onSaved={saved} />);
    fireEvent.changeText(screen.getByPlaceholderText(zh.tx.notePlaceholder), "Keep this draft");
    await act(async () => fireEvent.press(screen.getByTestId("transaction-save")));
    expect(alert).toHaveBeenCalledWith(zh.common.error, "Storage unavailable");
    expect(saved).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Keep this draft")).toBeTruthy();
    expect(screen.getByTestId("transaction-save")).not.toBeDisabled();
  });

  it("protects dirty edits and lets the user keep editing", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const ref = createRef<TransactionFormHandle>();
    render(<TransactionForm ref={ref} mode="edit" initialValues={initial} onSubmit={jest.fn()} />);
    expect(await ref.current!.prepareDismiss()).toBe(true);
    fireEvent.changeText(screen.getByPlaceholderText(zh.tx.notePlaceholder), "Unsaved");
    const decision = ref.current!.prepareDismiss();
    expect(alert).toHaveBeenCalledWith(formLabels.discardTitle, formLabels.discardMessage, expect.any(Array), expect.any(Object));
    alert.mock.calls[0]![2]![0]!.onPress!();
    expect(await decision).toBe(false);
  });

  it("resets dirty state when the resident editor changes sessions", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const ref = createRef<TransactionFormHandle>();
    const submit = jest.fn();
    const { rerender } = render(<TransactionForm ref={ref} sessionKey="one" mode="edit" initialValues={initial} onSubmit={submit} />);
    fireEvent.changeText(screen.getByPlaceholderText(zh.tx.notePlaceholder), "Unsaved");
    rerender(<TransactionForm ref={ref} sessionKey="two" mode="edit" initialValues={{ ...initial, note: "Second" }} onSubmit={submit} />);
    expect(screen.getByDisplayValue("Second")).toBeTruthy();
    expect(await ref.current!.prepareDismiss()).toBe(true);
    expect(alert).not.toHaveBeenCalled();
  });
});
