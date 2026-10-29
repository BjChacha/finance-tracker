import { AutomaticBackupPanel } from '@/features/backup/AutomaticBackupPanel';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '@/components/dialog';
import { Icon, type IconName } from '@/components/Icon';
import { SecondarySheetScreen } from '@/components/navigation/secondary-sheet-screen';
import { useExportBackup, useExportCsv, useLastBackupAt, useRestoreBackup } from '@/features/backup';
import { zh } from '@/i18n/zh';
import { dayjs } from '@/lib/date';
import { pickDocument } from '@/lib/fs';
import { useTheme } from '@/theme';

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function BackupScreen() {
  const { colors } = useTheme();
  const { data: lastBackupAt } = useLastBackupAt();
  const exportBackup = useExportBackup();
  const exportCsv = useExportCsv();
  const restore = useRestoreBackup();
  const [busy, setBusy] = useState(false);

  const working = busy || exportBackup.isPending || exportCsv.isPending || restore.isPending;

  async function onExportBackup() {
    try {
      await exportBackup.mutateAsync();
      showDialog(zh.backup.exportJson, zh.backup.exportDone);
    } catch (e) {
      showDialog(zh.common.error, errorMessage(e));
    }
  }

  async function onExportCsv() {
    try {
      const n = await exportCsv.mutateAsync();
      if (n === 0) showDialog(zh.backup.exportCsv, zh.backup.csvEmpty);
      else showDialog(zh.backup.exportCsv, zh.backup.csvDone(n));
    } catch (e) {
      showDialog(zh.common.error, errorMessage(e));
    }
  }

  async function onRestore(fileUri?: string) {
    setBusy(true);
    try {
      const picked = fileUri ? { uri: fileUri } : await pickDocument(['.json']);
      if (!picked) return;
      // 双重确认：两次弹窗，第二次才真正执行
      showDialog(zh.backup.restoreConfirmTitle, zh.backup.restoreConfirm1, [
        { text: zh.common.cancel, style: 'cancel' },
        {
          text: zh.common.confirm,
          style: 'destructive',
          onPress: () =>
            showDialog(zh.backup.restoreConfirmTitle2, zh.backup.restoreConfirm2, [
              { text: zh.common.cancel, style: 'cancel' },
              {
                text: zh.backup.restoreNow,
                style: 'destructive',
                onPress: () => {
                  restore.mutate(picked.uri, {
                    onSuccess: (result) =>
                      showDialog(
                        zh.backup.restoreDone,
                        zh.backup.restoreDoneDesc(result.counts.transactions),
                      ),
                    onError: (e) => showDialog(zh.common.error, errorMessage(e)),
                  });
                },
              },
            ]),
        },
      ]);
    } catch (e) {
      showDialog(zh.common.error, errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const actions: { icon: IconName; title: string; desc: string; onPress: () => void }[] = [
    {
      icon: 'upload',
      title: zh.backup.exportJson,
      desc: zh.backup.exportJsonDesc,
      onPress: onExportBackup,
    },
    { icon: 'file-text', title: zh.backup.exportCsv, desc: zh.backup.exportCsvDesc, onPress: onExportCsv },
    { icon: 'recycle', title: zh.backup.restore, desc: zh.backup.restoreDesc, onPress: () => { void onRestore(); } },
  ];

  return (
    <SecondarySheetScreen title={zh.backup.title}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16 }}
      >
        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{zh.backup.lastBackupAt}</Text>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', marginTop: 4 }}>
            {lastBackupAt ? dayjs(lastBackupAt).format('YYYY-MM-DD HH:mm') : zh.backup.never}
          </Text>
        </View>

        <AutomaticBackupPanel working={working} onRestore={(uri) => { void onRestore(uri); }} />

        {actions.map((action) => (
          <Pressable
            key={action.title}
            style={[styles.actionCard, { backgroundColor: colors.card, opacity: working ? 0.5 : 1 }]}
            disabled={working}
            onPress={action.onPress}
          >
            <Icon name={action.icon} size={24} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                {action.title}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 17 }}>
                {action.desc}
              </Text>
            </View>
            {working ? <ActivityIndicator color={colors.primary} /> : null}
          </Pressable>
        ))}

        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 12, lineHeight: 18 }}>
          {zh.backup.hint}
        </Text>
      </ScrollView>
    </SecondarySheetScreen>
  );
}

const styles = StyleSheet.create({
  infoCard: { borderRadius: 12, padding: 16, marginBottom: 16 },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
});
