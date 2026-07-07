import { useColorScheme } from 'react-native';

export const palette = {
  primary: '#F59E0B',
  expense: '#EF4444',
  income: '#10B981',
  transfer: '#3B82F6',
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
    expense: string;
    income: string;
    transfer: string;
  };
};

const light: AppTheme = {
  dark: false,
  colors: {
    background: '#F5F5F4',
    card: '#FFFFFF',
    text: '#1C1917',
    textSecondary: '#78716C',
    border: '#E7E5E4',
    ...palette,
  },
};

const dark: AppTheme = {
  dark: true,
  colors: {
    background: '#0C0A09',
    card: '#1C1917',
    text: '#FAFAF9',
    textSecondary: '#A8A29E',
    border: '#292524',
    ...palette,
  },
};

export function useTheme(): AppTheme {
  return useColorScheme() === 'dark' ? dark : light;
}
