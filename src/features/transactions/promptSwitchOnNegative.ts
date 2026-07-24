import { Alert } from 'react-native';
import type { TransactionType } from '@/db/schema';
import { zh } from '@/i18n/zh';
import { formatCents } from '@/lib/money';

/**
 * 支出/收入金额一般不为负：求值为负时提示是否切换为对侧类型（转账不处理）。
 * 由 TransactionForm 与周期记账编辑页共用；switchType / setAmountText 通过回调注入，
 * 以适配两处各自不同的类型切换副作用。
 */
export function promptSwitchOnNegative(opts: {
  cents: number;
  type: TransactionType;
  onSwitch: (opposite: TransactionType) => void;
  onAbsAmountText: (text: string) => void;
}): void {
  const { cents, type, onSwitch, onAbsAmountText } = opts;
  if (cents >= 0 || type === 'transfer') return;
  const opposite: TransactionType = type === 'expense' ? 'income' : 'expense';
  Alert.alert(
    zh.txList.negativeAmountTitle,
    zh.txList.negativeAmountMsg(opposite === 'income' ? zh.tx.income : zh.tx.expense),
    [
      { text: zh.common.cancel, style: 'cancel' },
      {
        text: zh.common.confirm,
        onPress: () => {
          onSwitch(opposite);
          onAbsAmountText(formatCents(Math.abs(cents), { grouping: false }));
        },
      },
    ],
  );
}
