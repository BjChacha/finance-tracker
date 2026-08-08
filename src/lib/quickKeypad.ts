import { Platform } from 'react-native';
import QuickKeypadModule from '../../modules/quick-keypad';
import type { PendingQuickAddLaunch } from '../../modules/quick-keypad';
import type { AppTheme } from '@/theme/themes';
import { toQuickKeypadThemePayload } from './quick-keypad-theme';

export type KeypadResult = { amountCents: number; currency: string };
export type { PendingQuickAddLaunch };

export type OpenKeypadOptions = {
  initialAmountCents?: number;
  initialCurrency?: string;
  allowCurrencySelection?: boolean;
  allowZero?: boolean;
};

function getNativeModule() {
  if (Platform.OS !== 'android') return null;
  return QuickKeypadModule;
}

export function isQuickKeypadAvailable(): boolean {
  return getNativeModule() !== null;
}

export function syncQuickKeypadTheme(theme: AppTheme, followsSystem = false): void {
  const mod = getNativeModule();
  if (!mod) return;
  try {
    mod.syncTheme(toQuickKeypadThemePayload(theme, followsSystem));
  } catch (error) {
    console.warn('[quick-keypad] Failed to sync native theme', error);
  }
}

export function completeAppLaunch(): void {
  const mod = getNativeModule();
  if (!mod) return;
  try {
    mod.completeAppLaunch();
  } catch (error) {
    console.warn('[quick-keypad] Failed to complete app launch', error);
  }
}

export function completeQuickAddHandoff(handoffId: string | null | undefined): void {
  if (!handoffId) return;
  getNativeModule()?.completeQuickAddHandoff(handoffId);
}

export async function revealQuickAddPresentation(
  handoffId: string | null | undefined,
): Promise<boolean> {
  if (!handoffId) return false;
  const mod = getNativeModule();
  if (!mod) return false;
  try {
    return await mod.revealQuickAddPresentation(handoffId);
  } catch (error) {
    console.warn('[quick-keypad] Failed to reveal quick-add presentation', error);
    return false;
  }
}

export function completeQuickAddInteractive(handoffId: string | null | undefined): void {
  if (!handoffId) return;
  getNativeModule()?.completeQuickAddInteractive(handoffId);
}

export function getPendingQuickAddLaunch(): PendingQuickAddLaunch | null {
  return getNativeModule()?.getPendingQuickAddLaunch() ?? null;
}

/** Subscribes to native shortcut handoffs that arrive before the router is ready. */
export function addQuickAddLaunchListener(
  listener: (launch: PendingQuickAddLaunch) => void,
): { remove(): void } {
  return (
    getNativeModule()?.addListener('onQuickAddLaunch', listener) ?? {
      remove() {},
    }
  );
}

/**
 * Opens QuickKeypadActivity in result mode on Android.
 * Returns null after cancellation or on unsupported platforms.
 */
export async function openKeypad(options: OpenKeypadOptions = {}): Promise<KeypadResult | null> {
  const mod = getNativeModule();
  if (!mod) return null;
  return mod.open(
    options.initialAmountCents ?? 0,
    options.initialCurrency ?? 'CNY',
    options.allowCurrencySelection ?? true,
    options.allowZero ?? false,
  );
}
