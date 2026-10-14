export const TRANSFER_OTHER_CATEGORY_ID = 'preset-transfer-other';

export const TRANSFER_CATEGORY_PRESETS = [
  {
    id: 'preset-transfer-account',
    name: '账户互转',
    icon: 'arrow-left-right',
    color: '#3B82F6',
  },
  {
    id: 'preset-transfer-bill-repayment',
    name: '账单还款',
    icon: 'credit-card',
    color: '#8B5CF6',
  },
  {
    id: 'preset-transfer-withdrawal',
    name: '取钱',
    icon: 'banknote',
    color: '#F59E0B',
  },
  {
    id: 'preset-transfer-deposit',
    name: '存钱',
    icon: 'piggy-bank',
    color: '#10B981',
  },
  {
    id: TRANSFER_OTHER_CATEGORY_ID,
    name: '其他',
    icon: 'package',
    color: '#9CA3AF',
  },
] as const;
