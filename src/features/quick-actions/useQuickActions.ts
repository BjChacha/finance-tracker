import { useEffect, useRef } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import {
  useGlobalSearchParams,
  usePathname,
  useRootNavigationState,
  useRouter,
} from "expo-router";
import * as QuickActions from "expo-quick-actions";
import type { Action } from "expo-quick-actions";
import { useResidentEditorDismiss } from "@/components/navigation/resident-editor-sheet-host";
import { zh } from "@/i18n/zh";
import {
  getPendingQuickAddLaunch,
  consumePendingNaturalLanguageLaunch,
} from "@/lib/quickKeypad";
import {
  NATURAL_LANGUAGE_PATH,
  QUICK_ADD_TRANSACTION_PATH,
  toNaturalLanguageHref,
  toQuickAddTransactionHref,
} from "./pendingQuickAdd";

const IOS_ADD_TRANSACTION_PATH = "/add-transaction";

/** iOS launcher shortcut for the standard card-based add flow. */
const ITEMS: Action[] = [
  {
    id: "add-transaction",
    title: zh.shortcut.addTransaction,
    icon: "add",
    params: { href: IOS_ADD_TRANSACTION_PATH },
  },
];

/**
 * Android quick-add launches are consumed pull-only:
 * - The deep link carried by MainActivity's intent is the primary channel.
 * - getPendingQuickAddLaunch() is the fallback for when ReactActivityDelegateWrapper drops the
 *   onNewIntent/deep-link callback, pulled exactly when the router root is ready and again when
 *   the app returns to the foreground.
 *
 * The previous event-push delivery reached whichever React root happened to be alive when the
 * keypad confirmed — often a stale root that CLEAR_TASK was about to destroy — racing the new
 * root's own navigation (ghost forms with stale amounts, lost forms, handoff timeouts).
 */
export function useQuickActionsBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ handoffId?: string }>();
  const rootNavigationState = useRootNavigationState();
  const dismissResidentEditor = useResidentEditorDismiss();
  const lastRoutedHandoffId = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const handle = (action?: Action | null) => {
      if (action?.id !== "add-transaction") return;
      router.navigate(IOS_ADD_TRANSACTION_PATH);
    };

    handle(QuickActions.initial);
    void QuickActions.setItems(ITEMS).catch(() => {});
    const subscription = QuickActions.addListener(handle);
    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (Platform.OS !== "android" || !rootNavigationState?.key) return;
    consumePendingLaunch();
    consumePendingNaturalLanguage();
    // rootNavigationState.key changes when the router remounts (new root after CLEAR_TASK);
    // re-pulling then covers the startup race where the deep link was dropped entirely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootNavigationState?.key]);

  useEffect(() => {
    if (Platform.OS !== "android" || !rootNavigationState?.key) return;
    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state !== "active") return;
        // Foreground pull: a reused singleTask MainActivity can drop its onNewIntent deep link
        // while React is still settling; by the time the user is back, the root is stable.
        // The pendingLaunch native side keeps a 30s TTL and is cleared once routed/completed.
        consumePendingLaunch();
        consumePendingNaturalLanguage();
      },
    );
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, params.handoffId, rootNavigationState?.key]);

  /** Idempotent: skips when this launch was already routed or the deep link already landed. */
  const consumePendingLaunch = () => {
    const launch = getPendingQuickAddLaunch();
    if (!launch) return;
    if (
      pathname === QUICK_ADD_TRANSACTION_PATH &&
      params.handoffId === launch.handoffId
    ) {
      lastRoutedHandoffId.current = launch.handoffId;
      return;
    }
    if (lastRoutedHandoffId.current === launch.handoffId) return;

    lastRoutedHandoffId.current = launch.handoffId;
    // The resident editor lives outside the router stack and must be hidden before replacement.
    // A single replace avoids exposing an intermediate root route during the handoff.
    dismissResidentEditor();
    router.replace(toQuickAddTransactionHref(launch));
  };

  /**
   * Fallback for the 一句话记账 shortcut. Expo's activity delegate can swallow onNewIntent, in
   * which case the deep link never reaches the router and the previous route stays on screen.
   * The native side records the launch, so pull it and route ourselves.
   */
  const consumePendingNaturalLanguage = () => {
    if (pathname === NATURAL_LANGUAGE_PATH) {
      // Already routed by the deep link; just drop the flag so it cannot fire later.
      consumePendingNaturalLanguageLaunch();
      return;
    }
    if (!consumePendingNaturalLanguageLaunch()) return;
    dismissResidentEditor();
    router.navigate(toNaturalLanguageHref());
  };
}
