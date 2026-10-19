import { NativeModule, requireOptionalNativeModule } from "expo";
export type QuickKeypadResult = {
  amountCents: number;
  currency: string;
};

export type PendingQuickAddLaunch = {
  amountCents: number;
  currency: string;
  type: "expense" | "income";
  handoffId: string;
};

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

declare class QuickKeypadModule extends NativeModule {
  syncTheme(theme: QuickKeypadThemePayload): boolean;
  completeAppLaunch(): void;

  open(
    initialAmountCents: number,
    initialCurrency: string,
    allowCurrencySelection: boolean,
    allowZero: boolean,
  ): Promise<QuickKeypadResult | null>;

  completeQuickAddHandoff(handoffId: string): void;
  revealQuickAddPresentation(handoffId: string): Promise<boolean>;
  completeQuickAddInteractive(handoffId: string): void;
  getPendingQuickAddLaunch(): PendingQuickAddLaunch | null;
  /**
   * One-shot pull for a launcher-originated natural-language launch. Returns true when the
   * shortcut intent was recorded natively within the TTL, regardless of whether its deep link
   * reached JS. Used as a fallback when the deep link is dropped.
   */
  consumePendingNaturalLanguageLaunch(): boolean;
}

export default requireOptionalNativeModule<QuickKeypadModule>("QuickKeypad");
