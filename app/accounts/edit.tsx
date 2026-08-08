import { useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { useResidentEditorRoute } from '@/components/navigation/resident-editor-sheet-host';
import { SecondarySheetScreen } from '@/components/navigation/secondary-sheet-screen';
import {
  AccountEditor,
  type AccountEditorHandle,
} from '@/features/accounts/components/AccountEditor';
import { zh } from '@/i18n/zh';

export default function AccountEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editorRef = useRef<AccountEditorHandle>(null);
  useResidentEditorRoute('account', id);

  if (id) return null;

  return (
    <SecondarySheetScreen
      title={zh.accounts.add}
      onBackPress={() => editorRef.current?.handleBackPress() ?? false}
      onBeforeDismiss={() => editorRef.current?.prepareDismiss() ?? true}
    >
      {({ dismiss }) => (
        <AccountEditor
          ref={editorRef}
          renderMode="editor"
          onComplete={() => dismiss()}
        />
      )}
    </SecondarySheetScreen>
  );
}
