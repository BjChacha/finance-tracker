import { Keyboard } from 'react-native';
import { useCallback, useMemo, useState } from 'react';
import { useResidentEditor } from '@/components/navigation/resident-editor-sheet-host';
import { SearchSheetScreen } from '@/components/navigation/search-sheet-screen';
import { TransactionSearchResults } from '@/features/transactions/components/transaction-search-results';
import {
  normalizeTransactionSearchQuery,
  usePrefetchTransaction,
} from '@/features/transactions';
import { zh } from '@/i18n/zh';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const SEARCH_DEBOUNCE_MS = 180;

export default function TransactionSearchScreen() {
  const { openTransaction: presentTransaction } = useResidentEditor();
  const prefetchTransaction = usePrefetchTransaction();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const normalizedQuery = useMemo(() => normalizeTransactionSearchQuery(query), [query]);
  const normalizedDebouncedQuery = useMemo(
    () => normalizeTransactionSearchQuery(debouncedQuery),
    [debouncedQuery],
  );
  const isDebouncing =
    normalizedQuery.length > 0 && normalizedQuery !== normalizedDebouncedQuery;
  const activeQuery = normalizedQuery.length === 0 ? '' : normalizedDebouncedQuery;

  const openTransaction = useCallback(
    (id: string) => {
      Keyboard.dismiss();
      presentTransaction(id);
    },
    [presentTransaction],
  );

  return (
    <SearchSheetScreen
      query={query}
      onChangeQuery={setQuery}
      placeholder={zh.txList.searchPlaceholder}
      cancelLabel={zh.common.cancel}
      clearLabel={zh.txList.clearSearch}
      dismissKeyboardLabel={zh.txList.dismissKeyboard}
      sheetTitle={zh.txList.searchResults}
    >
      <TransactionSearchResults
        query={activeQuery}
        displayQuery={query}
        isDebouncing={isDebouncing}
        onPressInTransaction={prefetchTransaction}
        onPressTransaction={openTransaction}
      />
    </SearchSheetScreen>
  );
}
