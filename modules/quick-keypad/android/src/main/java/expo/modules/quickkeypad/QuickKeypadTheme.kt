package expo.modules.quickkeypad

import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.util.TypedValue
import androidx.annotation.ColorInt
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class QuickKeypadThemeRecord(
  @Field val isDark: Boolean = false,
  @Field val background: String = "#F5F5F4",
  @Field val surface: String = "#FFFFFF",
  @Field val text: String = "#1C1917",
  @Field val secondaryText: String = "#78716C",
  @Field val border: String = "#E7E5E4",
  @Field val primary: String = "#F59E0B",
  @Field val onPrimary: String = "#FFFFFF",
) : Record

data class QuickKeypadPalette(
  val isDark: Boolean,
  @ColorInt val background: Int,
  @ColorInt val surface: Int,
  @ColorInt val text: Int,
  @ColorInt val secondaryText: Int,
  @ColorInt val border: Int,
  @ColorInt val primary: Int,
  @ColorInt val onPrimary: Int,
)

object QuickKeypadThemeStore {
  private const val PREFERENCES_NAME = "quick_keypad_theme"
  private const val KEY_INITIALIZED = "initialized"
  private const val KEY_IS_DARK = "is_dark"
  private const val KEY_BACKGROUND = "background"
  private const val KEY_SURFACE = "surface"
  private const val KEY_TEXT = "text"
  private const val KEY_SECONDARY_TEXT = "secondary_text"
  private const val KEY_BORDER = "border"
  private const val KEY_PRIMARY = "primary"
  private const val KEY_ON_PRIMARY = "on_primary"

  fun save(context: Context, theme: QuickKeypadThemeRecord): Boolean {
    val palette = theme.toPaletteOrNull() ?: return false
    return context
      .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_INITIALIZED, true)
      .putBoolean(KEY_IS_DARK, palette.isDark)
      .putInt(KEY_BACKGROUND, palette.background)
      .putInt(KEY_SURFACE, palette.surface)
      .putInt(KEY_TEXT, palette.text)
      .putInt(KEY_SECONDARY_TEXT, palette.secondaryText)
      .putInt(KEY_BORDER, palette.border)
      .putInt(KEY_PRIMARY, palette.primary)
      .putInt(KEY_ON_PRIMARY, palette.onPrimary)
      .commit()
  }

  fun read(context: Context): QuickKeypadPalette? {
    val preferences =
      context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    if (!preferences.getBoolean(KEY_INITIALIZED, false)) return null
    return QuickKeypadPalette(
      isDark = preferences.getBoolean(KEY_IS_DARK, false),
      background = preferences.getInt(KEY_BACKGROUND, Color.TRANSPARENT),
      surface = preferences.getInt(KEY_SURFACE, Color.TRANSPARENT),
      text = preferences.getInt(KEY_TEXT, Color.TRANSPARENT),
      secondaryText = preferences.getInt(KEY_SECONDARY_TEXT, Color.TRANSPARENT),
      border = preferences.getInt(KEY_BORDER, Color.TRANSPARENT),
      primary = preferences.getInt(KEY_PRIMARY, Color.TRANSPARENT),
      onPrimary = preferences.getInt(KEY_ON_PRIMARY, Color.TRANSPARENT),
    )
  }

  fun fromResources(context: Context): QuickKeypadPalette {
    val isDark =
      context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
        Configuration.UI_MODE_NIGHT_YES
    return QuickKeypadPalette(
      isDark = isDark,
      background = context.getColor(R.color.quick_handoff_background),
      surface = context.getColor(R.color.quick_keypad_panel),
      text = resolveThemeColor(
        context,
        android.R.attr.textColorPrimary,
        if (isDark) Color.WHITE else Color.BLACK,
      ),
      secondaryText = resolveThemeColor(
        context,
        android.R.attr.textColorSecondary,
        context.getColor(R.color.quick_keypad_divider),
      ),
      border = context.getColor(R.color.quick_keypad_divider),
      primary = context.getColor(R.color.quick_keypad_ok),
      onPrimary = Color.WHITE,
    )
  }

  private fun QuickKeypadThemeRecord.toPaletteOrNull(): QuickKeypadPalette? {
    return try {
      QuickKeypadPalette(
        isDark = isDark,
        background = Color.parseColor(background),
        surface = Color.parseColor(surface),
        text = Color.parseColor(text),
        secondaryText = Color.parseColor(secondaryText),
        border = Color.parseColor(border),
        primary = Color.parseColor(primary),
        onPrimary = Color.parseColor(onPrimary),
      )
    } catch (_: IllegalArgumentException) {
      null
    }
  }

  @ColorInt
  private fun resolveThemeColor(
    context: Context,
    attribute: Int,
    @ColorInt fallback: Int,
  ): Int {
    val value = TypedValue()
    if (!context.theme.resolveAttribute(attribute, value, true)) return fallback
    return if (value.resourceId != 0) {
      context.getColor(value.resourceId)
    } else {
      value.data
    }
  }
}
