import { resolveTheme, type ThemePref } from "../themes";

function luminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

describe("Filled action contrast", () => {
  it.each<ThemePref>(["light", "dark", "tiffany", "mint"])("keeps text readable on %s action surfaces", (preference) => {
    const { colors } = resolveTheme(preference, "light");
    const foreground = luminance(colors.onPrimary);
    for (const background of [colors.primary, colors.expense, colors.income, colors.transfer]) {
      const surface = luminance(background);
      const ratio = (Math.max(surface, foreground) + 0.05) / (Math.min(surface, foreground) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});
