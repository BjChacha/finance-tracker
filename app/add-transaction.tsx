import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AddTransactionFlow,
  parseAddTransactionLaunch,
  type AddTransactionRouteParams,
} from '@/features/transactions';

export default function AddTransactionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<AddTransactionRouteParams>();
  const launch = parseAddTransactionLaunch(params);
  const close = useCallback(() => router.back(), [router]);

  return (
    <AddTransactionFlow
      key={`${params.amount ?? ''}:${params.currency ?? ''}:${params.type ?? ''}`}
      {...launch}
      onClose={close}
      onCreated={close}
    />
  );
}
