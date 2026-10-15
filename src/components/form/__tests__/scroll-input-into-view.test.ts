import type { ScrollView, TextInput } from "react-native";
import { scrollInputIntoView } from "../scroll-input-into-view";

function setup(inputTop: number, inputHeight = 48) {
  const scrollTo = jest.fn();
  const scroll = {
    scrollTo,
    getNativeScrollRef: () => ({
      measureInWindow: (callback: (left: number, top: number, width: number, height: number) => void) => callback(0, 200, 360, 300),
    }),
  } as unknown as ScrollView;
  const input = {
    measureInWindow: (callback: (left: number, top: number, width: number, height: number) => void) => callback(16, inputTop, 328, inputHeight),
  } as TextInput;
  return { scroll, input, scrollTo };
}

describe("Form input visibility", () => {
  it("reveals an input above the actual scroll viewport edge", () => {
    const { scroll, input, scrollTo } = setup(480);
    scrollInputIntoView(scroll, input, 100, true);
    expect(scrollTo).toHaveBeenCalledWith({ y: 144, animated: true });
  });

  it("does not move an already visible input", () => {
    const { scroll, input, scrollTo } = setup(300);
    scrollInputIntoView(scroll, input, 100, true);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("respects reduced motion and ignores unmeasured inputs", () => {
    const { scroll, input, scrollTo } = setup(480);
    scrollInputIntoView(scroll, input, 100, false);
    expect(scrollTo).toHaveBeenCalledWith({ y: 144, animated: false });
    const unmeasured = setup(480, 0);
    scrollInputIntoView(unmeasured.scroll, unmeasured.input, 100, false);
    expect(unmeasured.scrollTo).not.toHaveBeenCalled();
  });
});
