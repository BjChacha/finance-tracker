import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('@/db/client', () => {
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const sqlite = new DatabaseSync(':memory:');
  const { drizzle } = require('drizzle-orm/sqlite-proxy');
  const db = drizzle(
    async (
      query: string,
      params: import('node:sqlite').SQLInputValue[],
      method: string,
    ) => {
      const statement = sqlite.prepare(query);
      statement.setReturnArrays(true);
      if (method === 'run') {
        statement.run(...params);
        return { rows: [] };
      }
      return {
        rows:
          method === 'get'
            ? statement.get(...params)
            : statement.all(...params),
      };
    },
  );
  return { db, sqlite };
});

import { assetHistory, assetHistoryStart } from '@/features/accounts/history';
import {
  listAccountsWithBalance,
  totalAssets,
} from '@/features/accounts/repository';
import { budgetStatus } from '@/features/budgets/repository';
import {
  parseTransactionParams,
  transactionParams,
} from '@/features/transactions/filters';
import {
  aggregateLedger,
  buildLedgerItems,
} from '@/features/transactions/ledger-model';
import {
  largestExpenses,
  updateTransaction,
  removeTransaction,
  transactionDailyTotals,
  transactionPage,
  transactionTotals,
  type TxListItem,
} from '@/features/transactions/repository';
import { categoryBreakdown, trend } from '../repository';

const sqlite = require('@/db/client')
  .sqlite as import('node:sqlite').DatabaseSync;
const range = { start: '2026-10-01', end: '2026-10-14' };

function transaction(
  id: string,
  type: string,
  amount: number,
  category: string | null,
  options: {
    account?: string;
    to?: string;
    fee?: number;
    toAmount?: number;
    date?: string;
    rate?: number;
  } = {},
) {
  const dateKey = options.date ?? '2026-10-02';
  sqlite
    .prepare(
      `INSERT INTO transactions (id, type, amount, amount_base_cents, currency, exchange_rate,
    fee, account_id, to_account_id, to_amount, category_id, date, date_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      type,
      amount,
      Math.round((amount * (options.rate ?? 1000000)) / 1000000),
      options.account === 'usd' ? 'USD' : 'CNY',
      options.rate ?? 1000000,
      options.fee ?? 0,
      options.account ?? 'cash',
      options.to ?? null,
      options.toAmount ?? null,
      category,
      100,
      dateKey,
      100,
      100,
    );
}

beforeAll(() => {
  const directory = join(process.cwd(), 'src/db/migrations');
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(join(directory, file), 'utf8'));
});

beforeEach(() => {
  sqlite.exec(
    'DELETE FROM transactions; DELETE FROM budgets; DELETE FROM accounts; DELETE FROM categories;',
  );
  const insert = sqlite.prepare(`INSERT INTO accounts
    (id, name, type, icon, color, initial_balance, currency, rate_to_base, include_in_total, archived, created_at, updated_at)
    VALUES (?, ?, 'cash', 'wallet', '#123456', ?, ?, ?, ?, ?, ?, 1)`);
  for (const [id, initial, currency, rate, included, archived] of [
    ['cash', 100000, 'CNY', 1000000, 1, 0],
    ['debt', -20000, 'CNY', 1000000, 1, 0],
    ['usd', 10000, 'USD', 7000000, 1, 0],
    ['excluded', 50000, 'CNY', 1000000, 0, 0],
    ['archived', 30000, 'CNY', 1000000, 1, 1],
  ] as const)
    insert.run(
      id,
      id,
      initial,
      currency,
      rate,
      included,
      archived,
      new Date('2026-10-01T12:00:00Z').getTime(),
    );
  sqlite.exec(`INSERT INTO categories (id, name, type, icon, color, parent_id, archived) VALUES
    ('food', 'Food', 'expense', 'utensils', '#123456', NULL, 0),
    ('coffee', 'Coffee', 'expense', 'coffee', '#123456', 'food', 0),
    ('old', 'Archived', 'expense', 'package', '#123456', NULL, 1),
    ('salary', 'Salary', 'income', 'wallet', '#123456', NULL, 0)`);
});

afterAll(() => sqlite.close());

describe('analytics against SQLite', () => {
  it('ranks transfer fees by their expense contribution, excluding the principal', async () => {
    transaction('large-principal', 'transfer', 500000, null, {
      to: 'debt',
      fee: 10,
    });
    transaction('large-fee', 'transfer', 10000, null, {
      to: 'debt',
      fee: 3000,
    });
    transaction('purchase', 'expense', 2000, 'food');
    expect((await largestExpenses(range, 2)).map((row) => row.id)).toEqual([
      'large-fee',
      'purchase',
    ]);
  });

  it('reconciles category moves, amount edits and deletion across lists, totals and assets', async () => {
    transaction('editable', 'expense', 1000, 'food');
    await updateTransaction('editable', {
      type: 'expense',
      amount: 2500,
      categoryId: 'old',
      accountId: 'cash',
      date: new Date('2026-10-03T12:00:00Z').getTime(),
    });
    expect(
      (
        await transactionPage({
          range,
          categoryId: 'food',
          includeChildren: true,
        })
      ).items,
    ).toEqual([]);
    expect(
      (await categoryBreakdown(range, 'expense')).map((row) => [
        row.categoryId,
        row.total,
      ]),
    ).toEqual([['old', 2500]]);
    expect(
      (await trend('day', range)).find((point) => point.key === '2026-10-03')
        ?.expense,
    ).toBe(2500);
    expect((await assetHistory(range, 'day')).closing.netWorth).toBe(147500);
    await removeTransaction('editable');
    expect(await transactionTotals({ range })).toEqual({
      income: 0,
      expense: 0,
      count: 0,
    });
    expect((await assetHistory(range, 'day')).closing.netWorth).toBe(150000);
  });
  it('reconciles parent, archived, uncategorized and fee slices with their transaction scopes', async () => {
    transaction('parent', 'expense', 1000, 'food');
    transaction('child', 'expense', 2000, 'coffee');
    transaction('old', 'expense', 300, 'old');
    transaction('missing', 'expense', 400, null);
    transaction('transfer', 'transfer', 10000, null, { to: 'debt', fee: 50 });
    transaction('income', 'income', 5000, 'salary');
    transaction('future', 'expense', 99999, 'food', { date: '2026-10-20' });
    const slices = await categoryBreakdown(range, 'expense');
    const summary = await transactionTotals({ range, type: 'expense' });
    expect(summary).toEqual({ income: 0, expense: 3750, count: 5 });
    expect(slices.reduce((sum, slice) => sum + slice.total, 0)).toBe(
      summary.expense,
    );
    for (const slice of slices) {
      const filter = {
        range,
        type: 'expense' as const,
        categoryId: slice.categoryId,
        includeChildren: true,
      };
      expect((await transactionTotals(filter)).expense).toBe(slice.total);
      expect((await transactionPage(filter)).items.length).toBeGreaterThan(0);
    }
    expect(slices.find((slice) => slice.categoryId === 'food')?.total).toBe(
      3000,
    );
    expect(
      (
        await transactionPage({
          range,
          categoryId: '__transfer_fees__',
          type: 'expense',
        })
      ).items.map((row) => row.id),
    ).toEqual(['transfer']);
    expect((await largestExpenses(range)).map((row) => row.id)).toEqual([
      'child',
      'parent',
      'missing',
    ]);
  });

  it('paginates ties without duplicates while full-scope group totals stay constant', async () => {
    for (let i = 0; i < 105; i++)
      transaction(`row-${String(i).padStart(3, '0')}`, 'expense', 100, 'food');
    const first = await transactionPage({ range });
    const second = await transactionPage({ range }, first.nextCursor);
    const third = await transactionPage({ range }, second.nextCursor);
    expect([
      first.items.length,
      second.items.length,
      third.items.length,
    ]).toEqual([50, 50, 5]);
    expect(third.nextCursor).toBeNull();
    expect(
      new Set(
        [...first.items, ...second.items, ...third.items].map((row) => row.id),
      ).size,
    ).toBe(105);
    const aggregate = aggregateLedger(await transactionDailyTotals({ range }));
    expect(aggregate.summary.expense).toBe(10500);
    expect(
      buildLedgerItems(first.items, aggregate.groups, new Set(['2026'])),
    ).toEqual([
      expect.objectContaining({
        kind: 'year',
        expense: 10500,
        count: 105,
        collapsed: true,
      }),
    ]);
  });

  it('values asset history in native currency and matches closing account balances', async () => {
    transaction('past', 'income', 20000, 'salary', { date: '2026-09-20' });
    transaction('expense', 'expense', 1000, 'food');
    transaction('repay', 'transfer', 5000, null, { to: 'debt', fee: 50 });
    transaction('fx', 'transfer', 7000, null, { to: 'usd', toAmount: 1000 });
    transaction('dollar', 'income', 100, 'salary', {
      account: 'usd',
      rate: 6500000,
    });
    transaction('outside', 'transfer', 1000, null, { to: 'excluded' });
    transaction('future', 'expense', 50000, 'food', { date: '2026-10-15' });
    const history = await assetHistory(range, 'day');
    const balances = await listAccountsWithBalance({ asOfDate: range.end });
    expect(history.opening.netWorth).toBe(170000);
    expect(history.closing.netWorth).toBe(168650);
    expect(history.closing.netWorth).toBe(totalAssets(balances));
    expect(history.closing.assets - history.closing.liabilities).toBe(
      history.closing.netWorth,
    );
    expect(history.points.at(-1)?.netWorth).toBe(history.closing.netWorth);
    expect(
      history.accounts.reduce((sum, account) => sum + account.changeBase, 0),
    ).toBe(-1350);
    expect(history.accounts.map((account) => account.id)).not.toContain(
      'excluded',
    );
    expect(await assetHistoryStart('2026-10-14')).toBe('2026-09-20');
  });

  it('supports negative, crossing-zero and flat histories without account-creation cutoffs', async () => {
    sqlite.exec("UPDATE accounts SET include_in_total = 0 WHERE id != 'debt'");
    transaction('cross', 'income', 30000, 'salary', {
      account: 'debt',
      date: '2026-09-20',
    });
    const history = await assetHistory(
      { start: '2026-09-01', end: '2026-09-30' },
      'week',
    );
    expect(history.opening).toEqual({
      assets: 0,
      liabilities: 20000,
      netWorth: -20000,
    });
    expect(history.closing).toEqual({
      assets: 10000,
      liabilities: 0,
      netWorth: 10000,
    });
    sqlite.exec('DELETE FROM transactions');
    expect(
      (await assetHistory(range, 'day')).points.every(
        (point) => point.netWorth === -20000,
      ),
    ).toBe(true);
  });

  it('keeps rounded asset endpoints consistent and revalues when account rates change', async () => {
    sqlite.exec(
      "UPDATE accounts SET initial_balance = 1, rate_to_base = 1500000 WHERE id = 'usd'",
    );
    for (let i = 0; i < 3; i++)
      transaction(`tiny-${i}`, 'income', 1, 'salary', { account: 'usd' });
    const history = await assetHistory(range, 'month');
    expect(
      history.accounts.find((account) => account.id === 'usd')?.closingBase,
    ).toBe(6);
    expect(history.closing.netWorth).toBe(
      totalAssets(await listAccountsWithBalance({ asOfDate: range.end })),
    );
  });

  it('uses the same cutoff for budget, income and expense trends', async () => {
    transaction('now', 'expense', 1000, 'food');
    transaction('future', 'expense', 9000, 'food', { date: '2026-10-20' });
    sqlite.exec(
      "INSERT INTO budgets(id, period, amount, created_at, updated_at) VALUES ('budget', 'month', 5000, 1, 1)",
    );
    expect(
      (await budgetStatus('month', '2026-10', range.end)).total?.spent,
    ).toBe(1000);
    expect(
      (await trend('week', range)).reduce(
        (sum, point) => sum + point.expense,
        0,
      ),
    ).toBe(1000);
  });
});

describe('drilldown parameters', () => {
  it('round-trips a parent-category scope', () => {
    const filters = {
      range,
      type: 'expense' as const,
      categoryId: 'food',
      includeChildren: true,
    };
    expect(parseTransactionParams(transactionParams(filters))).toMatchObject(
      filters,
    );
  });
  it.each([
    { start: '2026-02-30', end: '2026-03-01' },
    { start: '2026-10-01' },
    { start: '2026-10-02', end: '2026-10-01' },
    { categoryId: '__other__' },
    { type: 'income', categoryId: '__transfer_fees__' },
  ])('rejects unsafe scopes %j', (params) => {
    expect(parseTransactionParams(params)).toBeNull();
  });
});
