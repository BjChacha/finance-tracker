import type { AppTheme } from "@/theme/themes";

export type QuickKeypadThemePayload = {
	isDark: boolean;
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
): QuickKeypadThemePayload {
	return {
		isDark: theme.dark,
		background: theme.colors.background,
		surface: theme.colors.card,
		text: theme.colors.text,
		secondaryText: theme.colors.textSecondary,
		border: theme.colors.border,
		primary: theme.colors.primary,
		onPrimary: theme.colors.onPrimary,
	};
}
