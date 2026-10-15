import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { dayjs } from '@/lib/date';
import { shareFile } from '@/lib/fs';
import { configureAutoBackup, getAutoBackupConfig, runAutoBackup } from './automatic';
import { chooseBackupDirectory, listLocalSnapshots } from './storage';
import { backupLabels as labels } from './labels';

export function AutomaticBackupPanel({ working, onRestore }: { working: boolean; onRestore: (uri: string) => void }) {
  const { colors } = useTheme();
  const client = useQueryClient();
  const config = useQuery({ queryKey: ['backup', 'automatic'], queryFn: getAutoBackupConfig });
  const files = useQuery({ queryKey: ['backup', 'files'], queryFn: listLocalSnapshots });
  const action = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onError: (error) => Alert.alert(labels.error, error.message),
    onSettled: () => client.invalidateQueries({ queryKey: ['backup'] }),
  });
  const busy = working || action.isPending || config.isPending;
  const button = (label: string, work: () => Promise<unknown>) => (
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => action.mutate(work)}
      style={{ paddingVertical: 12, opacity: busy ? 0.5 : 1 }}>
      <Text style={{ color: colors.primary, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ padding: 16, borderRadius: 12, marginBottom: 16, backgroundColor: colors.card, gap: 8 }}>
      <Text style={{ color: colors.text, fontWeight: '600', fontSize: 17 }}>{labels.title}</Text>
      <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>{labels.schedule}</Text>
      {config.error ? <Text style={{ color: colors.expense }}>{config.error.message}</Text> : null}
      <Text style={{ color: colors.text }}>{config.data?.enabled ? labels.enabled : labels.disabled}</Text>
      <Text style={{ color: colors.textSecondary }}>{labels.lastSuccess}: {config.data?.lastSuccessAt ? dayjs(config.data.lastSuccessAt).format('YYYY-MM-DD HH:mm') : labels.never}</Text>
      <Text selectable style={{ color: colors.textSecondary, fontSize: 12 }}>
        {config.data?.directory ? `${labels.folder}: ${decodeURIComponent(config.data.directory).split('tree/').pop()}` : labels.localOnly}
      </Text>
      {config.data?.lastError ? <Text style={{ color: colors.expense }}>{labels.failed}: {config.data.lastError}</Text> : null}
      {button(config.data?.enabled ? labels.pause : labels.enable, async () => {
        const enabled = !config.data?.enabled;
        await configureAutoBackup({ enabled });
        if (enabled) await runAutoBackup();
      })}
      {Platform.OS === 'android' ? button(labels.chooseFolder, async () => {
        const directory = await chooseBackupDirectory();
        if (directory) {
          await configureAutoBackup({ directory, enabled: true });
          await runAutoBackup();
        }
      }) : null}
      {button(labels.now, () => runAutoBackup(true))}
      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{labels.retention}</Text>
      <Text style={{ color: colors.text, fontWeight: '600', marginTop: 8 }}>{labels.history}</Text>
      {files.error ? <Text style={{ color: colors.expense }}>{files.error.message}</Text> : null}
      {(files.data ?? []).map((file) => (
        <View key={file.uri} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: 12 }} selectable>{file.name}</Text>
          <View style={{ flexDirection: 'row', gap: 24 }}>
            {button(labels.share, () => shareFile(file.uri, 'application/json'))}
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => onRestore(file.uri)} style={{ paddingVertical: 12 }}>
              <Text style={{ color: colors.primary }}>{labels.restore}</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}
