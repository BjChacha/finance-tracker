import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { SecondarySheetScreen } from '@/components/navigation/secondary-sheet-screen';
import { showDialog } from '@/components/dialog';
import { useImportBatches, useUndoImportBatch } from '@/features/import';
import { zh } from '@/i18n/zh';
import { dayjs } from '@/lib/date';
import { useTheme, type AppTheme } from '@/theme';

const t = zh.imp;

function makeStyles(theme: AppTheme) {
  const { colors } = theme;
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      overflow: 'hidden',
    },
    row: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 6,
    },
    rowTitle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    sourceName: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
      flex: 1,
    },
    meta: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    undoBtn: {
      marginTop: 4,
      alignSelf: 'flex-start',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.expense,
      gap: 4,
    },
    undoText: {
      color: colors.expense,
      fontSize: 12,
      fontWeight: '600',
    },
    empty: {
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: 48,
      lineHeight: 22,
    },
  });
}

/** 导入历史：列出历史批次，可随时撤销（删除该批次导入的交易） */
export default function ImportHistoryScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = makeStyles(theme);
  const qc = useQueryClient();
  const batches = useImportBatches();
  const undo = useUndoImportBatch();

  function confirmUndo(batchId: string, txCount: number) {
    showDialog(t.undoBatch, t.undoBatchConfirm(txCount), [
      { text: zh.common.cancel, style: 'cancel' },
      {
        text: zh.common.confirm,
        style: 'destructive',
        onPress: () => {
          undo.mutate(batchId, {
            onSuccess: (removed) => {
              void qc.refetchQueries({ queryKey: ['importBatches'] });
              showDialog(t.undoBatch, t.undoBatchDone(removed));
            },
            onError: (e) =>
              showDialog(zh.common.error, e instanceof Error ? e.message : String(e)),
          });
        },
      },
    ]);
  }

  return (
    <SecondarySheetScreen title={t.historyTitle}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16, gap: 10 }}
      >
        {batches.data && batches.data.length === 0 && (
          <Text style={styles.empty}>{t.historyEmpty}</Text>
        )}
        {batches.data?.map((batch, i) => (
          <View
            key={batch.id}
            style={[
              styles.card,
              i > 0 && { marginTop: 4 },
            ]}
          >
            <View style={styles.row}>
              <View style={styles.rowTitle}>
                <Icon name="file-text" size={16} color={colors.primary} />
                <Text style={styles.sourceName}>{batch.sourceName}</Text>
              </View>
              <Text style={styles.meta}>
                {dayjs(batch.importedAt).format('YYYY-MM-DD HH:mm')} ·{' '}
                {t.batchSummary(batch.txCount, batch.skippedCount)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.undoBatch}
                style={styles.undoBtn}
                disabled={undo.isPending}
                onPress={() => confirmUndo(batch.id, batch.txCount)}
              >
                <Text style={styles.undoText}>{t.undoBatch}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </SecondarySheetScreen>
  );
}
