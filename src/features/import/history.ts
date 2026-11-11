import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { importBatches, type ImportBatch } from '@/db/schema';
import { invalidateTransactionData } from '@/features/transactions';
import { undoBatch } from './core/pipeline';

/** 历史导入批次，新的在前 */
export async function listImportBatches(): Promise<ImportBatch[]> {
  return db.select().from(importBatches).orderBy(desc(importBatches.importedAt));
}

/** key: ['importBatches'] */
export function useImportBatches() {
  return useQuery({
    queryKey: ['importBatches'],
    queryFn: listImportBatches,
  });
}

/**
 * 撤销一个历史导入批次：删除该批次导入的全部交易并移除批次记录。
 * 成功后失效交易相关查询与批次列表。
 */
export function useUndoImportBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => undoBatch(batchId),
    onSuccess: async () => {
      await Promise.all([
        invalidateTransactionData(qc),
        qc.invalidateQueries({ queryKey: ['categories'] }),
        qc.invalidateQueries({ queryKey: ['accounts'] }),
        qc.invalidateQueries({ queryKey: ['importBatches'] }),
      ]);
    },
  });
}
