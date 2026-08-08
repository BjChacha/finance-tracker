import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const FLOATING_TAB_BAR_HEIGHT = 60;
export const FLOATING_TAB_BAR_HORIZONTAL_MARGIN = 16;
export const FLOATING_TAB_BAR_BOTTOM_GAP = 10;
export const FLOATING_TAB_BAR_CONTENT_GAP = 16;

export function useFloatingTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return (
    insets.bottom +
    FLOATING_TAB_BAR_BOTTOM_GAP +
    FLOATING_TAB_BAR_HEIGHT +
    FLOATING_TAB_BAR_CONTENT_GAP
  );
}
