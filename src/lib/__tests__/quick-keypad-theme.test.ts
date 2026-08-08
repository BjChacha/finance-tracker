import { toQuickKeypadThemePayload } from "@/lib/quick-keypad-theme";
import { resolveTheme, type ThemePref } from "@/theme/themes";

describe("toQuickKeypadThemePayload", () => {
	it.each<ThemePref>(["light", "tiffany", "mint", "dark"])(
		"maps the resolved %s theme without changing semantic colors",
		(pref) => {
			const theme = resolveTheme(pref, "light");
			expect(toQuickKeypadThemePayload(theme)).toEqual({
				isDark: theme.dark,
				followsSystem: false,
				background: theme.colors.background,
				surface: theme.colors.card,
				text: theme.colors.text,
				secondaryText: theme.colors.textSecondary,
				border: theme.colors.border,
				primary: theme.colors.primary,
				onPrimary: theme.colors.onPrimary,
			});
		},
	);

	it("maps auto to the resolved system appearance", () => {
		const light = toQuickKeypadThemePayload(resolveTheme("auto", "light"), true);
		const dark = toQuickKeypadThemePayload(resolveTheme("auto", "dark"), true);

		expect(light.isDark).toBe(false);
		expect(light.followsSystem).toBe(true);
		expect(dark.isDark).toBe(true);
		expect(dark.followsSystem).toBe(true);
	});
});
