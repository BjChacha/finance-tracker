import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { showDialog } from "@/components/dialog";
import { ActionButton } from "../action-button";
import { formLabels } from "../labels";

jest.mock("@/components/dialog", () => ({
  showDialog: jest.fn(),
  showToast: jest.fn(),
}));

describe("ActionButton", () => {
  afterEach(() => jest.restoreAllMocks());

  it("locks repeated taps until the operation completes", async () => {
    let complete!: () => void;
    const save = jest.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
    render(<ActionButton label="Save" onPress={save} />);
    const button = screen.getByRole("button", { name: "Save" });
    act(() => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: formLabels.saving })).toBeDisabled();
    await act(async () => complete());
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("reports failure and allows a retry", async () => {
    const alert = jest.mocked(showDialog).mockClear();
    const save = jest.fn().mockRejectedValueOnce(new Error("Storage unavailable")).mockResolvedValueOnce(undefined);
    render(<ActionButton label="Save" onPress={save} />);
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Save" })));
    expect(alert).toHaveBeenCalledWith(expect.any(String), "Storage unavailable");
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Save" })));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("does not submit a disabled action", () => {
    const save = jest.fn();
    render(<ActionButton label="Save" onPress={save} disabled />);
    fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(save).not.toHaveBeenCalled();
  });
});
