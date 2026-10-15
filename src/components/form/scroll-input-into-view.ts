import type { ScrollView, TextInput } from "react-native";

type ScrollTarget = Pick<ScrollView, "getNativeScrollRef" | "scrollTo">;
type InputTarget = Pick<TextInput, "measureInWindow">;

export function scrollInputIntoView(
  scroll: ScrollTarget | null,
  input: InputTarget | null,
  offset: number,
  animated: boolean,
) {
  if (!scroll || !input) return;
  scroll.getNativeScrollRef()?.measureInWindow((_left, top, _width, height) => {
    input.measureInWindow((_inputLeft, inputTop, _inputWidth, inputHeight) => {
      if (!height || !inputHeight) return;
      const overlap = inputTop + inputHeight - (top + height) + 16;
      if (overlap > 0) scroll.scrollTo({ y: offset + overlap, animated });
    });
  });
}
