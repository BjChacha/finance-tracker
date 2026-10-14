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
    // The native side resolves inside a decorView.postOnAnimation callback, which the OS
    // can drop while the activity is paused (e.g. the in-app keypad opened mid-entry).
    // Fail open after a beat so the sheet entry is never held hostage by a lost frame.
    return await Promise.race([
      mod.revealQuickAddPresentation(handoffId),
      new Promise<false>((resolve) => {
        setTimeout(() => resolve(false), 1_200);
      }),
    ]);
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

/**
 * Opens QuickKeypadActivity in result mode on Android.
 * Returns null after cancellation or on unsupported platforms.
 *
 * If the native side never settles (activity result lost while the app was backgrounded),
 * the timeout resolves null so callers are never left awaiting forever; the stale native
 * promise slot is recycled by the next open().
 */
const OPEN_KEYPAD_TIMEOUT_MS = 15_000;

export async function openKeypad(options: OpenKeypadOptions = {}): Promise<KeypadResult | null> {
  const mod = getNativeModule();
  if (!mod) return null;
  const pending = mod.open(
    options.initialAmountCents ?? 0,
    options.initialCurrency ?? 'CNY',
    options.allowCurrencySelection ?? true,
    options.allowZero ?? false,
  );
  return await Promise.race([
    pending,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), OPEN_KEYPAD_TIMEOUT_MS);
    }),
  ]);
}
