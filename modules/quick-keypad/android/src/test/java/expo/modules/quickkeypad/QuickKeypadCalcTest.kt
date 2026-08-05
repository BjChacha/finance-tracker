package expo.modules.quickkeypad

import org.junit.Assert.assertEquals
import org.junit.Test

class QuickKeypadCalcTest {
  @Test
  fun `empty expression accepts only a leading minus`() {
    assertEquals("-", QuickKeypadActivity.Calc.appendKey("", "-"))
    assertEquals("", QuickKeypadActivity.Calc.appendKey("", "+"))
    assertEquals("-5", QuickKeypadActivity.Calc.appendKey("-", "5"))
    assertEquals("-0.", QuickKeypadActivity.Calc.appendKey("-", "."))
  }

  @Test
  fun `first numeric input replaces a prefilled amount`() {
    assertEquals(
      QuickKeypadActivity.Calc.InputResult("5", false),
      QuickKeypadActivity.Calc.applyInput("12.34", "5", true),
    )
    assertEquals(
      QuickKeypadActivity.Calc.InputResult("0.", false),
      QuickKeypadActivity.Calc.applyInput("12.34", ".", true),
    )
  }

  @Test
  fun `operator and backspace edit a prefilled amount`() {
    assertEquals(
      QuickKeypadActivity.Calc.InputResult("12.34-", false),
      QuickKeypadActivity.Calc.applyInput("12.34", "-", true),
    )
    assertEquals(
      QuickKeypadActivity.Calc.InputResult("12.3", false),
      QuickKeypadActivity.Calc.applyInput("12.34", "⌫", true),
    )
  }

  @Test
  fun `clear disables replacement mode`() {
    assertEquals(
      QuickKeypadActivity.Calc.InputResult("", false),
      QuickKeypadActivity.Calc.applyInput("12.34", "C", true),
    )
  }
}
