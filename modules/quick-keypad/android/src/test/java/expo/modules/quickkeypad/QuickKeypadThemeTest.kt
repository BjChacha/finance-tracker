package expo.modules.quickkeypad

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class QuickKeypadThemeTest {
  @Test
  fun `legacy fixed themes keep their cached palette`() {
    assertFalse(
      shouldRefreshSystemTheme(
        followsSystem = false,
        cachedIsDark = false,
        systemIsDark = true,
      ),
    )
  }

  @Test
  fun `system theme keeps the cache when appearance is unchanged`() {
    assertFalse(
      shouldRefreshSystemTheme(
        followsSystem = true,
        cachedIsDark = true,
        systemIsDark = true,
      ),
    )
  }

  @Test
  fun `system theme refreshes the palette when appearance changes`() {
    assertTrue(
      shouldRefreshSystemTheme(
        followsSystem = true,
        cachedIsDark = false,
        systemIsDark = true,
      ),
    )
  }
}
