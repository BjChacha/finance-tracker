import { NativeModule, requireOptionalNativeModule } from 'expo';

export type QuickKeypadResult = {
  amountCents: number;
  currency: string;
};

export type PendingQuickAddLaunch = {
  amountCents: number;
  currency: string;
  type: 'expense' | 'income';
  handoffId: string;
};

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

type QuickKeypadModuleEvents = {
  onQuickAddLaunch: (launch: PendingQuickAddLaunch) => void;
};

declare class QuickKeypadModule extends NativeModule<QuickKeypadModuleEvents> {
  syncTheme(theme: QuickKeypadThemePayload): boolean;

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
}

export default requireOptionalNativeModule<QuickKeypadModule>('QuickKeypad');
