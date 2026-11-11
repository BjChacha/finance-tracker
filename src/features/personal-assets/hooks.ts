import { useCallback } from 'react';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PersonalAsset } from '@/db/schema';
import { invalidateTransactionData } from '@/features/transactions';
import { listTransactions } from '@/features/transactions/repository';
import {
  countInstallmentPeriods,
  createAsset,
  createAssetsBatch,
  createInstallmentAsset,
  deleteAsset,
  disposeAsset,
  findAssetsBySourceTransaction,
  getAssetById,
  ignoreCandidateTransaction,
  loadCandidateBase,
  listAssets,
  reactivateAsset,
  sellAssetByTransaction,
  sellAssetManual,
  settleInstallment,
  updateAsset,
  type AssetInput,
  type InstallmentAssetInput,
} from './repository';
import {
  CANDIDATE_DEFAULT_RANGE_DAYS,
  candidateRange,
  viewAssetCandidates,
  type AssetCandidate,
} from './candidates';

/** 全部 personal-assets 查询共用的 key 前缀；写操作统一失效整个前缀 */
export const ASSETS_QUERY_KEY = 'personal-assets' as const;

/** key: ['personal-assets', 'list'] */
export function usePersonalAssets() {
  return useQuery({
    queryKey: [ASSETS_QUERY_KEY, 'list'],
    queryFn: () => listAssets(),
  });
}

export function assetQueryOptions(id: string) {
  return queryOptions({
    queryKey: [ASSETS_QUERY_KEY, 'detail', id],
    queryFn: () => getAssetById(id),
  });
}

/** key: ['personal-assets', 'detail', id] */
export function useAsset(id: string) {
  return useQuery({ ...assetQueryOptions(id), enabled: id.length > 0 });
}

/** key: ['personal-assets', 'source', transactionId] */
export function useAssetsFromTransaction(transactionId: string) {
  return useQuery({
    queryKey: [ASSETS_QUERY_KEY, 'source', transactionId],
    queryFn: () => findAssetsBySourceTransaction(transactionId),
    enabled: transactionId.length > 0,
  });
}

/**
 * 疑似资产消费候选（key: ['personal-assets', 'candidates']）。
 *
 * 所有时间窗共享同一个「评分基底」查询（内部带持久缓存，签名一致时零扫描）；
 * 换时间窗只重跑 select 切片，不触发数据库查询 —— 资产页横幅与候选清单
 * 同时挂载时也只取一次。
 */
export function useAssetCandidates(rangeDays: number = CANDIDATE_DEFAULT_RANGE_DAYS) {
  const select = useCallback(
    (base: AssetCandidate[]) => viewAssetCandidates(base, rangeDays, { sort: 'date-desc' }),
    [rangeDays],
  );
  return useQuery({
    queryKey: [ASSETS_QUERY_KEY, 'candidates'],
    queryFn: () => loadCandidateBase(),
    select,
  });
}

function useInvalidateAssets() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [ASSETS_QUERY_KEY] });
}

export function useCreateAsset() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: (input: AssetInput) => createAsset(input),
    onSuccess: invalidate,
  });
}

/**
 * 创建分期资产：会生成首付交易（+可能立即补的期次）与周期规则，
 * 因此除资产前缀外还需失效流水、账户余额与周期规则列表。
 */
export function useCreateInstallmentAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InstallmentAssetInput) => createInstallmentAsset(input),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [ASSETS_QUERY_KEY] }),
        invalidateTransactionData(qc),
        qc.invalidateQueries({ queryKey: ['recurring'] }),
      ]);
    },
  });
}

/** 提前结清分期：停用规则 + 记录结清日 */
export function useSettleInstallment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => settleInstallment(assetId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [ASSETS_QUERY_KEY] }),
        qc.invalidateQueries({ queryKey: ['recurring'] }),
      ]);
    },
  });
}

/** 分期已生成期次交易数（规则可空）；用于详情进度展示 */
export function useInstallmentPeriods(ruleId: string | null) {
  return useQuery({
    queryKey: [ASSETS_QUERY_KEY, 'installment-periods', ruleId],
    queryFn: () => (ruleId ? countInstallmentPeriods(ruleId) : 0),
    enabled: ruleId !== null && ruleId.length > 0,
  });
}

/** 批量生成资产（候选清单多选后调用）；成功后资产列表/看板/候选一起刷新 */
export function useCreateAssetsFromCandidates() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: (inputs: AssetInput[]) => createAssetsBatch(inputs),
    onSuccess: invalidate,
  });
}

/** 忽略一笔候选（持久化到 settings，重启后不再提示） */
export function useIgnoreAssetCandidate() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: (transactionId: string) => ignoreCandidateTransaction(transactionId),
    onSuccess: invalidate,
  });
}

export function useUpdateAsset() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AssetInput }) => updateAsset(id, input),
    onSuccess: invalidate,
  });
}

/** 手动出售（可选自动生成收入交易）：新收入影响流水/余额/统计，需联动失效 */
export function useSellAssetManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      assetId: string;
      soldCents: number;
      dateKey: string;
      recordIncome: boolean;
      accountId?: string;
    }) => sellAssetManual(input),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [ASSETS_QUERY_KEY] }),
        invalidateTransactionData(qc),
      ]);
    },
  });
}

/** 关联出售：只改资产状态，交易无新增 */
export function useSellAssetByTransaction() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: (input: { assetId: string; transactionId: string }) =>
      sellAssetByTransaction(input),
    onSuccess: invalidate,
  });
}

/** key: ['personal-assets', 'sale-income', rangeDays] —— 出售关联用的收入交易列表 */
export function useSaleIncomeList(rangeDays: number) {
  return useQuery({
    queryKey: [ASSETS_QUERY_KEY, 'sale-income', rangeDays],
    queryFn: () =>
      listTransactions({ range: candidateRange(rangeDays), type: 'income' }),
  });
}

export function useDisposeAsset() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ assetId, dateKey }: { assetId: string; dateKey: string }) =>
      disposeAsset(assetId, dateKey),
    onSuccess: invalidate,
  });
}

export function useReactivateAsset() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: (assetId: string) => reactivateAsset(assetId),
    onSuccess: invalidate,
  });
}

export function useDeleteAsset() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: (assetId: string) => deleteAsset(assetId),
    onSuccess: invalidate,
  });
}

export type { AssetInput, PersonalAsset };
