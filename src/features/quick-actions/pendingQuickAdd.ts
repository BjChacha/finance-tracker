import type { PendingQuickAddLaunch } from '@/lib/quickKeypad';

export const QUICK_ADD_TRANSACTION_PATH = '/quick-add-transaction';

export type QuickAddTransactionHref = {
  pathname: typeof QUICK_ADD_TRANSACTION_PATH;
  params: {
    amount: string;
    currency: string;
    type: PendingQuickAddLaunch['type'];
    handoffId: string;
  };
};

export function toQuickAddTransactionHref(
  launch: PendingQuickAddLaunch,
): QuickAddTransactionHref {
  return {
    pathname: QUICK_ADD_TRANSACTION_PATH,
    params: {
      amount: String(launch.amountCents),
      currency: launch.currency,
      type: launch.type,
      handoffId: launch.handoffId,
    },
  };
}
