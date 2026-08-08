/**
 * 主题注册表：预设主题对象、类型与解析器。
 *
 * 语义数据色（expense/income/transfer/warning）在所有主题中保持一致——
 * 它们承载“支出/收入/转账/告警”的语义，不应随主题变化；只有“外壳色”
 * （background/card/text/textSecondary/border/primary）随主题切换。
 */

/** 用户主题偏好。`auto` 跟随系统深浅（仅 Light↔Dark）；其余为固定主题。 */
export type ThemePref = 'auto' | 'light' | 'tiffany' | 'mint' | 'dark';

/** 选择器中的展示顺序 */
export const THEME_PREFS: ThemePref[] = ['auto', 'light', 'tiffany', 'mint', 'dark'];

/** 语义数据色（跨主题不变）+ 默认 primary（amber） */
export const palette = {
  primary: '#F59E0B',
  expense: '#EF4444',
  income: '#10B981',
  transfer: '#3B82F6',
  /** 预算达阈值等告警色（黄） */
  warning: '#EAB308',
};

export type AppTheme = {
  dark: boolean;
  colors: {
    background: string;
    card: string;
    text: string;
    textSecondary: string;
    border: string;
    primary: string;
    /** primary 表面上的文字/图标色（按钮文字、选中态文字等） */
    onPrimary: string;
    expense: string;
    income: string;
    transfer: string;
    warning: string;
  };
};

/* --------------------------------- 预设主题 --------------------------------- */

const light: AppTheme = {
  dark: false,
  colors: {
    ...palette,
    background: '#F5F5F4',
    card: '#FFFFFF',
    text: '#1C1917',
    textSecondary: '#78716C',
    border: '#E7E5E4',
    onPrimary: '#FFFFFF',
  },
};

const tiffany: AppTheme = {
  dark: false,
  colors: {
    ...palette,
    primary: '#0ABAB5',
    background: '#EAF7F6',
    card: '#FFFFFF',
    text: '#134E4A',
    textSecondary: '#5C7C77',
    border: '#C9EAE6',
    onPrimary: '#FFFFFF',
  },
};

// 注意：mint 的 primary 与语义色 income 同为 #10B981。两者语境不同
// （primary 用于 UI 外壳：按钮/选中态/FAB；income 用于数据：图表柱、正数金额），
// 影响有限，按既定色板保留。如需消歧，可后续单独给 income 数据色换一档更亮的绿。
const mint: AppTheme = {
  dark: false,
  colors: {
    ...palette,
    primary: '#10B981',
    background: '#ECFDF5',
    card: '#FFFFFF',
    text: '#064E3B',
    textSecondary: '#5C7D6E',
    border: '#C8F0DC',
    onPrimary: '#FFFFFF',
  },
};

const dark: AppTheme = {
  dark: true,
  colors: {
    ...palette,
    background: '#0C0A09',
    card: '#1C1917',
    text: '#FAFAF9',
    textSecondary: '#A8A29E',
    border: '#292524',
    onPrimary: '#FFFFFF',
  },
};

/**
 * 偏好 → 主题对象。`auto` 按 system 深浅在 Light↔Dark 间切换。
 * system 含 RN 0.86 的 'unspecified'（视为浅色）。
 */
export function resolveTheme(
  pref: ThemePref,
  system: 'light' | 'dark' | 'unspecified' | null | undefined,
): AppTheme {
  switch (pref) {
    case 'light':
      return light;
    case 'tiffany':
      return tiffany;
    case 'mint':
      return mint;
    case 'dark':
      return dark;
    case 'auto':
    default:
      return system === 'dark' ? dark : light;
  }
}
