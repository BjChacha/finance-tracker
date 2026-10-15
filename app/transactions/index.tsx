import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  SecondarySheetScreen,
  SheetHeaderIconButton,
} from '@/components/navigation/secondary-sheet-screen';
import { dashboardText as copy } from '@/features/dashboard/labels';
import { LedgerScreen } from '@/features/transactions/components/ledger-screen';
import { parseTransactionParams } from '@/features/transactions/filters';

export default function TransactionsScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const filters = parseTransactionParams(params);
  const title =
    typeof params.title === 'string' ? params.title : copy.filteredTransactions;
  return (
    <SecondarySheetScreen
      title={title}
      headerRight={
        <SheetHeaderIconButton
          icon="search"
          label={copy.search}
          onPress={() => router.push('/transactions/search')}
        />
      }
    >
      <LedgerScreen
        key={JSON.stringify(filters)}
        filters={filters ?? {}}
        invalid={!filters}
      />
    </SecondarySheetScreen>
  );
}
