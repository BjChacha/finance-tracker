import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Icon } from '@/components/Icon';
import { IconBubble } from '@/components/IconBubble';
import { useResidentEditor } from '@/components/navigation/resident-editor-sheet-host';
import { zh } from '@/i18n/zh';
import { dayjs, formatTime, todayKey, yesterdayKey } from '@/lib/date';
import { resolveIconKey } from '@/lib/iconResolvers';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme, type AppTheme } from '@/theme';
import { usePrefetchTransaction } from '../hooks';
import type { TxListItem } from '../repository';

type Props = {
  tx: TxListItem;
  /** 同组内非末行显示底部分隔线 */
  showDivider?: boolean;
  style?: ViewStyle;
};

/**
 * 单条交易行：左图标、中标题+副标题（时间·账户·备注）、右金额。
 * 「最近交易」与「全部交易」共用，保证两处元素与点击交互完全一致；
 * 点击通过 resident editor 打开交易详情。
 */
export function TransactionRow({ tx, showDivider = true, style }: Props) {
  const theme = useTheme();
  const { colors } = theme;
  const { openTransaction } = useResidentEditor();
  const prefetchTransaction = usePrefetchTransaction();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const isTransfer = tx.type === 'transfer';
  const amountColor =
    tx.type === 'expense' ? colors.expense : tx.type === 'income' ? colors.income : colors.transfer;
  const title = isTransfer
    ? `${tx.accountName ?? '?'} → ${tx.toAccountName ?? '?'}`
    : (tx.categoryName ?? zh.common.empty);
  // 今日/昨日显示时分；更早显示 MM-DD（与「最近交易」一致）
  const timeLabel =
    tx.dateKey === todayKey() || tx.dateKey === yesterdayKey()
      ? formatTime(tx.date)
      : dayjs(tx.date).format('MM-DD');
  const categoryLabel = tx.categoryName
    ? tx.parentCategoryName
      ? `${tx.parentCategoryName} › ${tx.categoryName}`
      : tx.categoryName
    : zh.common.empty;
  const sub = isTransfer
    ? [timeLabel, categoryLabel, tx.note].filter(Boolean).join(' · ')
    : `${timeLabel} · ${tx.accountName ?? ''}${tx.note ? ` · ${tx.note}` : ''}`;
  const sign = tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : '';

  return (
    <Pressable
      style={[styles.row, showDivider && styles.rowBorder, style]}
      onPressIn={() => prefetchTransaction(tx)}
      onPress={() => openTransaction(tx.id)}
    >
      {isTransfer ? (
        <View style={styles.leadIcon}>
          <Icon name="arrow-left-right" size={22} color={colors.textSecondary} />
        </View>
      ) : (
        <IconBubble
          name={resolveIconKey(tx.categoryIcon, 'category')}
          color={tx.categoryColor ?? colors.primary}
          size={36}
        />
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Text style={[styles.amount, { color: amountColor }]}>
        {sign}
        {formatCentsWithSymbol(tx.amount, tx.currency)}
      </Text>
    </Pressable>
  );
}

function makeStyles({ colors }: AppTheme) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
    rowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    leadIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { color: colors.text, fontSize: 15, fontWeight: '500' },
    sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    amount: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  });
}
