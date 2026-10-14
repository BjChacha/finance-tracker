import type { TransactionType } from '@/db/schema';
import { formatCents } from '@/lib/money';

const TX_TYPE_LABEL: Record<TransactionType, string> = {
  expense: '支出',
  income: '收入',
  transfer: '转账',
};

export type CsvTransactionRow = {
  dateKey: string;
  type: TransactionType;
  amount: number;
  fee: number;
  note: string;
  categoryName: string | null;
  categoryParentName: string | null;
  accountName: string | null;
  toAccountName: string | null;
};

export function toCsvRecord(row: CsvTransactionRow) {
  const category = row.categoryParentName ?? row.categoryName ?? '';
  const subCategory = row.categoryParentName ? (row.categoryName ?? '') : '';
  return {
    日期: row.dateKey,
    类型: TX_TYPE_LABEL[row.type],
    '金额(元)': formatCents(row.amount, { grouping: false }),
    分类: category,
    子分类: subCategory,
    账户: row.accountName ?? '',
    转入账户: row.toAccountName ?? '',
    '手续费(元)': row.fee > 0 ? formatCents(row.fee, { grouping: false }) : '',
    备注: row.note,
  };
}
