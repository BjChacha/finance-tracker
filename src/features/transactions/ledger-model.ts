import type { LedgerDay, LedgerTotals, TxListItem } from './repository';

export type LedgerItem =
  | ({
      kind: 'year' | 'month' | 'day';
      key: string;
      collapsed: boolean;
    } & LedgerTotals)
  | { kind: 'transaction'; key: string; transaction: TxListItem };

export function aggregateLedger(days: LedgerDay[]) {
  const summary: LedgerTotals = { income: 0, expense: 0, count: 0 };
  const groups = new Map<string, LedgerTotals>();
  for (const day of days) {
    for (const target of [
      summary,
      ...[day.dateKey.slice(0, 4), day.dateKey.slice(0, 7), day.dateKey].map(
        (key) => {
          if (!groups.has(key))
            groups.set(key, { income: 0, expense: 0, count: 0 });
          return groups.get(key)!;
        },
      ),
    ]) {
      target.income += day.income;
      target.expense += day.expense;
      target.count += day.count;
    }
  }
  return { summary, groups };
}

/** Headers use complete SQL aggregates, never the currently loaded page. */
export function buildLedgerItems(
  rows: TxListItem[],
  groups: Map<string, LedgerTotals>,
  collapsed: ReadonlySet<string>,
): LedgerItem[] {
  const items: LedgerItem[] = [];
  const seen = new Set<string>();
  for (const transaction of rows) {
    const year = transaction.dateKey.slice(0, 4);
    const month = transaction.dateKey.slice(0, 7);
    for (const [kind, key] of [
      ['year', year],
      ['month', month],
      ['day', transaction.dateKey],
    ] as const) {
      if (
        (kind !== 'year' && collapsed.has(year)) ||
        (kind === 'day' && collapsed.has(month))
      )
        continue;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        kind,
        key,
        collapsed: collapsed.has(key),
        ...(groups.get(key) ?? { income: 0, expense: 0, count: 0 }),
      });
    }
    if (
      !collapsed.has(year) &&
      !collapsed.has(month) &&
      !collapsed.has(transaction.dateKey)
    )
      items.push({ kind: 'transaction', key: transaction.id, transaction });
  }
  return items;
}
