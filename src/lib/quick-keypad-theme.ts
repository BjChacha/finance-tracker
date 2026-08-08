import type { AppTheme } from "@/theme/themes";

export type QuickKeypadThemePayload = {
	isDark: boolean;
	followsSystem: boolean;
	background: string;
	surface: string;
	text: string;
	secondaryText: string;
	border: string;
	primary: string;
	onPrimary: string;
};

export function toQuickKeypadThemePayload(
	theme: AppTheme,
	followsSystem = false,
): QuickKeypadThemePayload {
	return {
		isDark: theme.dark,
		followsSystem,
		background: theme.colors.background,
		surface: theme.colors.card,
		text: theme.colors.text,
		secondaryText: theme.colors.textSecondary,
		border: theme.colors.border,
		primary: theme.colors.primary,
		onPrimary: theme.colors.onPrimary,
	};
}
