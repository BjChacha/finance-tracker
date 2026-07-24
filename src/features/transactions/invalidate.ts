import type { QueryClient } from '@tanstack/react-query';

/**
 * 交易数据变更后的集中失效：明细、单笔详情、账户余额，
 * 统计（stats）与预算（budget/budgets）前缀，以及分类推荐基线。
 */
export async function invalidateTransactionData(qc: QueryClient): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['transactions'] }),
    qc.invalidateQueries({ queryKey: ['transaction'] }),
    qc.invalidateQueries({ queryKey: ['transactions-summary'] }),
    qc.invalidateQueries({ queryKey: ['account-balances'] }),
    qc.invalidateQueries({ queryKey: ['stats'] }),
    qc.invalidateQueries({ queryKey: ['budget'] }),
    qc.invalidateQueries({ queryKey: ['budgets'] }),
    qc.invalidateQueries({ queryKey: ['budget-status'] }),
    qc.invalidateQueries({ queryKey: ['suggest-baseline'] }),
  ]);
}
