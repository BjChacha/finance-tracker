import { categoryBreakdown } from '../repository';
import { sqlite } from '@/db/client';

jest.mock('@/features/accounts', () => ({ listAccountsWithBalance: jest.fn() }));
jest.mock('@/db/client', () => {
  const { DatabaseSync } = require('node:sqlite');
  const { drizzle } = require('drizzle-orm/expo-sqlite');
  const native = new DatabaseSync(':memory:');
  const adapter = { prepareSync: (query: string) => {
    const statement = native.prepare(query);
    return {
      executeSync: (params: unknown[]) => {
        if (/^select/i.test(query.trim())) return { getAllSync: () => statement.all(...params) };
        const result = statement.run(...params);
        return { changes: result.changes, lastInsertRowId: result.lastInsertRowid };
      },
      executeForRawResultSync: (params: unknown[]) => {
        statement.setReturnArrays(true);
        return { getAllSync: () => statement.all(...params) };
      },
    };
  } };
  return { db: drizzle(adapter), sqlite: { execSync: (sql: string) => native.exec(sql) } };
});

beforeEach(() => {
  sqlite.execSync(`
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS categories;
    CREATE TABLE categories (id TEXT, name TEXT, icon TEXT, color TEXT, parent_id TEXT);
    CREATE TABLE transactions (type TEXT, amount_base_cents INTEGER, date_key TEXT, category_id TEXT, fee INTEGER, exchange_rate INTEGER);
    INSERT INTO categories VALUES ('parent', 'Transport', 'bus', '#123456', NULL), ('child', 'Taxi', 'car', '#654321', 'parent');
    INSERT INTO transactions VALUES
      ('expense', 5000, '2026-09-01', 'parent', 0, 1000000),
      ('expense', 2500, '2026-09-02', 'child', 0, 1000000),
      ('expense', 1000, '2026-09-03', NULL, 0, 1000000),
      ('transfer', 100000, '2026-09-04', NULL, 10, 2000000),
      ('income', 30000, '2026-09-05', NULL, 0, 1000000),
      ('expense', 99999, '2026-10-01', 'parent', 0, 1000000);
  `);
});

const range = { start: '2026-09-01', end: '2026-09-30' };

it('includes unclassified expenses and converted fees without counting transfer principal', async () => {
  const rows = await categoryBreakdown(range, 'expense');
  expect(rows.map((row) => [row.categoryId, row.total])).toEqual([
    ['parent', 7500], ['__uncategorized__', 1000], ['__transfer_fees__', 20],
  ]);
  expect(rows.reduce((sum, row) => sum + row.total, 0)).toBe(8520);
  expect(rows[0].pct).toBe(88);
});

it('keeps income and category drill-down scoped to the selected type and parent', async () => {
  expect((await categoryBreakdown(range, 'income')).map((row) => row.total)).toEqual([30000]);
  expect((await categoryBreakdown(range, 'expense', 'parent')).map((row) => row.total)).toEqual([5000, 2500]);
});
