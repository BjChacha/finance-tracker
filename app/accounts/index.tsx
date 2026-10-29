import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '@/components/dialog';
import { IconBubble } from '@/components/IconBubble';
import {
  SecondarySheetScreen,
  SheetHeaderIconButton,
} from '@/components/navigation/secondary-sheet-screen';
import { totalAssets, useAccountBalances, useArchiveAccount } from '@/features/accounts';
import {
  AccountEditor,
  type AccountEditorHandle,
} from '@/features/accounts/components/AccountEditor';
import { zh } from '@/i18n/zh';
import { formatCentsWithSymbol } from '@/lib/money';
import { resolveIconKey } from '@/lib/iconResolvers';
import { useTheme } from '@/theme';

type EditorState = { kind: 'create' } | { kind: 'edit'; accountId: string };

export default function AccountsScreen() {
  const { colors } = useTheme();
  const { data: accounts = [] } = useAccountBalances();
  const archive = useArchiveAccount();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const editorRef = useRef<AccountEditorHandle>(null);
  const dismissPending = useRef(false);

  async function closeEditor() {
    if (dismissPending.current) return;
    dismissPending.current = true;
    try {
      if (await editorRef.current?.prepareDismiss()) setEditor(null);
    } finally {
      dismissPending.current = false;
    }
  }

  function confirmArchive(id: string, name: string) {
    showDialog(`${zh.accounts.archive}「${name}」`, zh.accounts.archiveConfirm, [
      { text: zh.common.cancel, style: 'cancel' },
      { text: zh.accounts.archive, style: 'destructive', onPress: () => archive.mutate(id) },
    ]);
  }

  const title =
    editor?.kind === 'create'
      ? zh.accounts.add
      : editor?.kind === 'edit'
        ? zh.accounts.edit
        : zh.accounts.title;

  return (
    <SecondarySheetScreen
      title={title}
      headerLeft={
        editor ? (
          <SheetHeaderIconButton
            icon="chevron-left"
            label={zh.common.back}
            onPress={() => void closeEditor()}
          />
        ) : undefined
      }
      headerRight={
        editor ? null : (
          <SheetHeaderIconButton
            icon="plus"
            label={zh.accounts.add}
            onPress={() => setEditor({ kind: 'create' })}
          />
        )
      }
      onBackPress={() => {
        if (editorRef.current?.handleBackPress()) return true;
        if (!editor) return false;
        void closeEditor();
        return true;
      }}
      onBeforeDismiss={() => editorRef.current?.prepareDismiss() ?? true}
    >
      {editor ? (
        <AccountEditor
          ref={editorRef}
          key={editor.kind === 'edit' ? editor.accountId : 'create'}
          accountId={editor.kind === 'edit' ? editor.accountId : undefined}
          onComplete={() => setEditor(null)}
        />
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.background }}
          contentContainerStyle={{ padding: 16 }}
        >
          <View style={[styles.totalCard, { backgroundColor: colors.primary }]}>
            <Text style={[styles.totalLabel, { color: `${colors.onPrimary}D9` }]}>
              {zh.accounts.totalAssets}
            </Text>
            <Text style={[styles.totalValue, { color: colors.onPrimary }]}>
              {formatCentsWithSymbol(totalAssets(accounts))}
            </Text>
          </View>

          {accounts.length === 0 && (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 24 }}>
              {zh.accounts.empty}
            </Text>
          )}

          {accounts.map((account) => (
            <Pressable
              key={account.id}
              style={[styles.row, { backgroundColor: colors.card }]}
              onPress={() => setEditor({ kind: 'edit', accountId: account.id })}
              onLongPress={() => confirmArchive(account.id, account.name)}
            >
              <IconBubble
                name={resolveIconKey(account.icon, 'account')}
                color={account.color}
                size={40}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>
                  {account.name}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {zh.accounts.types[account.type]}
                  {account.includeInTotal === 0 ? ` · 不${zh.accounts.includeInTotal}` : ''}
                </Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
                {formatCentsWithSymbol(account.balance, account.currency)}
              </Text>
            </Pressable>
          ))}
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 12,
              textAlign: 'center',
              marginTop: 12,
            }}
          >
            长按账户可归档
          </Text>
        </ScrollView>
      )}
    </SecondarySheetScreen>
  );
}

const styles = StyleSheet.create({
  totalCard: { borderRadius: 14, padding: 20, marginBottom: 16 },
  totalLabel: { fontSize: 13 },
  totalValue: { fontSize: 30, fontWeight: '700', marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
});
