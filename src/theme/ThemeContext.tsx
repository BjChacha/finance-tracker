import { Appearance, useColorScheme } from 'react-native';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSettingSync, setSetting } from '@/db/settings';
import { syncQuickKeypadTheme } from '@/lib/quickKeypad';
import { resolveTheme, type AppTheme, type ThemePref } from './themes';

const THEME_KEY = 'theme';

type ThemeContextValue = {
  theme: AppTheme;
  pref: ThemePref;
  setPref: (pref: ThemePref) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * 同步读取持久化的主题偏好，用作 Provider 初始值——避免冷启动主题闪烁。
 * 首次安装（settings 表尚未迁移）或 JSON 损坏时回退 'auto'。
 */
function readInitialPref(): ThemePref {
  return getSettingSync<ThemePref>(THEME_KEY, 'auto') ?? 'auto';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readInitialPref);
  const systemScheme = useColorScheme();

  const theme = useMemo(() => resolveTheme(pref, systemScheme), [pref, systemScheme]);

  useEffect(() => {
    syncQuickKeypadTheme(theme, pref === 'auto');
  }, [pref, theme]);

  const setPref = (next: ThemePref) => {
    setPrefState(next);
    // 持久化失败不阻塞 UI；下次启动会重新读取
    setSetting(THEME_KEY, next).catch((e) => {
      console.warn('[theme] 保存主题偏好失败', e);
    });
  };

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, pref, setPref }),
    [theme, pref],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * 当前主题对象（保持 `useTheme(): AppTheme` 历史调用契约）。
 * 正常渲染树内由 ThemeProvider 提供；异常路径（如 ErrorBoundary 在 Provider 之外）
 * 回退到 auto + 系统色，确保不会因缺 Provider 而崩溃。
 */
export function useTheme(): AppTheme {
  const ctx = useContext(ThemeContext);
  return ctx ? ctx.theme : resolveTheme('auto', Appearance.getColorScheme());
}

/** 主题偏好读写（供选择器页） */
export function useThemePref(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  // 兜底：正常渲染树内不会走到
  return {
    theme: resolveTheme('auto', Appearance.getColorScheme()),
    pref: 'auto',
    setPref: () => {},
  };
}
