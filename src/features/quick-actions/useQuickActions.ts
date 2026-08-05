import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  useGlobalSearchParams,
  usePathname,
  useRootNavigationState,
  useRouter,
} from 'expo-router';
import * as QuickActions from 'expo-quick-actions';
import type { Action } from 'expo-quick-actions';
import { useResidentEditorDismiss } from '@/components/navigation/resident-editor-sheet-host';
import { zh } from '@/i18n/zh';
import {
  addQuickAddLaunchListener,
  getPendingQuickAddLaunch,
  type PendingQuickAddLaunch,
} from '@/lib/quickKeypad';
import {
  QUICK_ADD_TRANSACTION_PATH,
  toQuickAddTransactionHref,
} from './pendingQuickAdd';

const IOS_ADD_TRANSACTION_PATH = '/add-transaction';

/** iOS launcher shortcut for the standard card-based add flow. */
const ITEMS: Action[] = [
  {
    id: 'add-transaction',
    title: zh.shortcut.addTransaction,
    icon: 'add',
    params: { href: IOS_ADD_TRANSACTION_PATH },
  },
];

/**
 * iOS registers and routes the shortcut through Expo Router. Android primarily uses a deep link
 * from QuickKeypadActivity and keeps a native pending launch as a fallback for startup races.
 */
export function useQuickActionsBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ handoffId?: string }>();
  const rootNavigationState = useRootNavigationState();
  const dismissResidentEditor = useResidentEditorDismiss();
  const lastRoutedHandoffId = useRef<string | null>(null);
  const [pendingAndroidLaunch, setPendingAndroidLaunch] =
    useState<PendingQuickAddLaunch | null>(() =>
      Platform.OS === 'android' ? getPendingQuickAddLaunch() : null,
    );

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const handle = (action?: Action | null) => {
      if (action?.id !== 'add-transaction') return;
      router.navigate(IOS_ADD_TRANSACTION_PATH);
    };

    handle(QuickActions.initial);
    void QuickActions.setItems(ITEMS).catch(() => {});
    const subscription = QuickActions.addListener(handle);
    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = addQuickAddLaunchListener(setPendingAndroidLaunch);
    const latestLaunch = getPendingQuickAddLaunch();
    if (latestLaunch) setPendingAndroidLaunch(latestLaunch);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !rootNavigationState?.key ||
      !pendingAndroidLaunch
    ) {
      return;
    }

    if (
      pathname === QUICK_ADD_TRANSACTION_PATH &&
      params.handoffId === pendingAndroidLaunch.handoffId
    ) {
      lastRoutedHandoffId.current = pendingAndroidLaunch.handoffId;
      return;
    }
    if (lastRoutedHandoffId.current === pendingAndroidLaunch.handoffId) return;

    lastRoutedHandoffId.current = pendingAndroidLaunch.handoffId;
    setPendingAndroidLaunch(null);
    // The resident editor lives outside the router stack and must be hidden before replacement.
    // A single replace avoids exposing an intermediate root route during the handoff.
    dismissResidentEditor();
    router.replace(toQuickAddTransactionHref(pendingAndroidLaunch));
  }, [
    dismissResidentEditor,
    params.handoffId,
    pathname,
    pendingAndroidLaunch,
    rootNavigationState?.key,
    router,
  ]);
}
