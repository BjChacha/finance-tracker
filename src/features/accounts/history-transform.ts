import { dayjs } from '@/lib/date';
import type { DateRange } from '@/lib/analytics-range';
import { toBaseCents } from '@/lib/money';
import { bucketKeys, type TrendGranularity } from '@/features/stats/transform';
import type { AccountWithBalance } from './repository';

export type AssetTotals = {
  assets: number;
  liabilities: number;
  netWorth: number;
};
export type AssetPoint = AssetTotals & { dateKey: string };
export type AccountDelta = {
  accountId: string;
  dateKey: string;
  delta: number;
};
export type AccountChange = {
  id: string;
  name: string;
  currency: string;
  opening: number;
  closing: number;
  openingBase: number;
  closingBase: number;
  changeBase: number;
};
export type AssetHistory = {
  range: DateRange;
  opening: AssetTotals;
  closing: AssetTotals;
  points: AssetPoint[];
  accounts: AccountChange[];
};

export function assetTotals(
  accounts: Pick<AccountWithBalance, 'balance' | 'rateToBase'>[],
): AssetTotals {
  let assets = 0;
  let liabilities = 0;
  for (const account of accounts) {
    const base = toBaseCents(account.balance, account.rateToBase);
    if (base >= 0) assets += base;
    else liabilities -= base;
  }
  return { assets, liabilities, netWorth: assets - liabilities };
}

/** Accumulate native currency first, then value each account at its current rate. */
export function buildAssetHistory(
  openingAccounts: AccountWithBalance[],
  deltas: AccountDelta[],
  range: DateRange,
  granularity: TrendGranularity,
): AssetHistory {
  const accounts = openingAccounts
    .filter((a) => a.includeInTotal === 1 && a.archived === 0)
    .map((a) => ({ ...a }));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const opening = assetTotals(accounts);
  const openingDate = dayjs(range.start)
    .subtract(1, 'day')
    .format('YYYY-MM-DD');
  const points: AssetPoint[] = [{ dateKey: openingDate, ...opening }];
  const sorted = deltas
    .filter((d) => d.dateKey >= range.start && d.dateKey <= range.end)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  let index = 0;
  for (const key of bucketKeys(range.start, range.end, granularity)) {
    const date =
      granularity === 'month'
        ? `${key}-01`
        : granularity === 'year'
          ? `${key}-01-01`
          : key;
    const bucketEnd = dayjs(date).endOf(granularity).format('YYYY-MM-DD');
    const end = bucketEnd < range.end ? bucketEnd : range.end;
    while (index < sorted.length && sorted[index]!.dateKey <= end) {
      const delta = sorted[index++]!;
      const account = byId.get(delta.accountId);
      if (account) account.balance += delta.delta;
    }
    points.push({ dateKey: end, ...assetTotals(accounts) });
  }
  const openingById = new Map(openingAccounts.map((a) => [a.id, a.balance]));
  return {
    range,
    opening,
    closing: assetTotals(accounts),
    points,
    accounts: accounts
      .map((account) => {
        const balance = openingById.get(account.id) ?? 0;
        const openingBase = toBaseCents(balance, account.rateToBase);
        const closingBase = toBaseCents(account.balance, account.rateToBase);
        return {
          id: account.id,
          name: account.name,
          currency: account.currency,
          opening: balance,
          closing: account.balance,
          openingBase,
          closingBase,
          changeBase: closingBase - openingBase,
        };
      })
      .sort(
        (a, b) =>
          Math.abs(b.changeBase) - Math.abs(a.changeBase) ||
          a.id.localeCompare(b.id),
      ),
  };
}
