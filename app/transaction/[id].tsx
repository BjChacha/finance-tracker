import { useLocalSearchParams } from 'expo-router';
import { useResidentEditorRoute } from '@/components/navigation/resident-editor-sheet-host';

export default function TransactionDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useResidentEditorRoute('transaction', id);
  return null;
}
