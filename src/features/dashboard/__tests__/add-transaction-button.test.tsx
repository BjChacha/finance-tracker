import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { openKeypad } from "@/lib/quickKeypad";
import { AddTransactionButton } from "../add-transaction-button";

jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("@/components/Icon", () => ({ Icon: () => null }));
jest.mock("@/theme", () => ({
  motion: { fast: 100 },
  useTheme: () => ({ colors: { primary: "#008080", onPrimary: "#ffffff" } }),
}));
jest.mock("@/lib/quickKeypad", () => ({
  isQuickKeypadAvailable: () => true,
  openKeypad: jest.fn(),
}));

it("long press opens only the text entry route; the next short press still opens the keypad", async () => {
  const originalOS = Platform.OS;
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "android",
  });
  const push = jest.fn();
  jest
    .mocked(useRouter)
    .mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
  jest.mocked(openKeypad).mockResolvedValue(null);
  try {
    render(<AddTransactionButton bottom={100} />);
    const button = screen.getByRole("button");
    fireEvent(button, "pressIn");
    await act(async () => {
      fireEvent(button, "longPress");
    });
    await act(async () => {
      fireEvent.press(button);
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({
      pathname: "/natural-language-transaction",
      params: { source: "app" },
    });
    expect(openKeypad).not.toHaveBeenCalled();
    fireEvent(button, "pressIn");
    await act(async () => {
      fireEvent.press(button);
    });
    expect(openKeypad).toHaveBeenCalledTimes(1);
  } finally {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalOS,
    });
  }
});
