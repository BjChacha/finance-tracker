import { fireEvent, render, screen } from "@testing-library/react-native";
import { DateTimeSemanticCards } from "../components/date-time-semantic-cards";

describe("DateTimeSemanticCards", () => {
	it("shows only the formatted values and forwards each press", () => {
		const onPressDate = jest.fn();
		const onPressTime = jest.fn();
		render(
			<DateTimeSemanticCards
				dateText="2026-08-01"
				timeText="18:39"
				onPressDate={onPressDate}
				onPressTime={onPressTime}
			/>,
		);

		expect(screen.getByText("2026/08/01")).toBeTruthy();
		expect(screen.getByText("18:39")).toBeTruthy();
		expect(screen.queryByText("\u4ECA\u5929")).toBeNull();
		expect(screen.queryByText("\u73B0\u5728")).toBeNull();

		const buttons = screen.getAllByRole("button");
		expect(buttons[0].props.accessibilityLabel).toBe("\u65E5\u671F 2026-08-01");
		expect(buttons[1].props.accessibilityLabel).toBe("\u65F6\u95F4 18:39");
		fireEvent.press(buttons[0]);
		fireEvent.press(buttons[1]);
		expect(onPressDate).toHaveBeenCalledTimes(1);
		expect(onPressTime).toHaveBeenCalledTimes(1);
	});
});
