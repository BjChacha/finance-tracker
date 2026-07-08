import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { exportBackup, exportCsv, getLastBackupAt, restoreBackup } from './repository';

/** 上次备份时间，key: ['backup', 'lastBackupAt'] */
export function useLastBackupAt() {
  return useQuery({
    queryKey: ['backup', 'lastBackupAt'],
    queryFn: () => getLastBackupAt(),
  });
}

export function useExportBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => exportBackup(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backup'] }),
  });
}

export function useExportCsv() {
  return useMutation({ mutationFn: () => exportCsv() });
}

export function useRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileUri: string) => restoreBackup(fileUri),
    // 恢复是整库覆盖，全量失效所有缓存
    onSuccess: () => qc.invalidateQueries(),
  });
}
