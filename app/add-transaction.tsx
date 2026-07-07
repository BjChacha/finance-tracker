import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { TransactionForm, useCreateTransaction } from '@/features/transactions';
import { zh } from '@/i18n/zh';

export default function AddTransactionScreen() {
  const router = useRouter();
  const create = useCreateTransaction();

  return (
    <TransactionForm
      submitting={create.isPending}
      onSubmit={(input) => {
        create.mutate(input, {
          onSuccess: () => router.back(),
          onError: (e) => Alert.alert(zh.common.error, e instanceof Error ? e.message : String(e)),
        });
      }}
    />
  );
}
