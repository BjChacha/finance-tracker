import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

jest.mock('@/db/client', () => ({
  db: {
    select: jest.fn(),
  },
}));

import { db } from '@/db/client';
import type { TxListItem } from '../repository';
import { searchTransactions } from '../repository';

type SearchRow = TxListItem & { createdAt: number };

const mockSelect = db.select as jest.Mock;

function makeRow(overrides: Partial<SearchRow> = {}): SearchRow {
  return {
    id: 'tx-1',
    type: 'expense',
    amount: 200_500,
    fee: 0,
    accountId: 'account-1',
    toAccountId: null,
    categoryId: 'category-1',
    date: 1_700_000_000_000,
    dateKey: '2026-07-31',
    note: 'Dinner',
    currency: 'CNY',
    exchangeRate: 1_000_000,
    amountBaseCents: 200_500,
    toAmount: null,
    categoryName: 'Dinner',
    categoryIcon: 'utensils',
    categoryColor: '#F97316',
    parentCategoryName: 'Food',
    projectId: 'project-1',
    projectName: 'Trip',
    projectIcon: 'plane',
    projectColor: '#3B82F6',
    accountName: 'Bank',
    toAccountName: null,
    createdAt: 1_700_000_000_100,
    ...overrides,
  };
}

function setupSelect(rows: SearchRow[]) {
  const builder = {
    from: jest.fn(),
    leftJoin: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn().mockResolvedValue(rows),
  };
  builder.from.mockReturnValue(builder);
  builder.leftJoin.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.orderBy.mockReturnValue(builder);
  mockSelect.mockReturnValue(builder);
  return builder;
}

describe('searchTransactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips SQLite entirely for an empty normalized query', async () => {
    await expect(searchTransactions({ query: '　 ' })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('builds amount-prefix matching against the primary display amount', async () => {
    const builder = setupSelect([]);

    await searchTransactions({ query: '200' });

    const compiled = new SQLiteSyncDialect().sqlToQuery(builder.where.mock.calls[0]![0]);
    expect(compiled.sql).toContain("printf('%d.%02d'");
    expect(compiled.sql).toContain("ESCAPE '~'");
    expect(compiled.params).toContain('200%');
  });

  it('AND-combines text tokens across every searchable relation', async () => {
    const builder = setupSelect([]);

    await searchTransactions({ query: '餐饮 中国银行 2026旅游 支出' });

    const compiled = new SQLiteSyncDialect().sqlToQuery(builder.where.mock.calls[0]![0]);
    expect(compiled.sql).toContain('"categories"."name"');
    expect(compiled.sql).toContain('"parent_categories"."name"');
    expect(compiled.sql).toContain('"accounts"."name"');
    expect(compiled.sql).toContain('"to_accounts"."name"');
    expect(compiled.sql).toContain('"projects"."name"');
    expect(compiled.sql).toContain('"transactions"."note"');
    expect(compiled.sql).toContain("WHEN 'expense' THEN ?");
    expect(compiled.params).toEqual(
      expect.arrayContaining([
        '支出 expense',
        '收入 income',
        '转账 transfer',
        '%餐饮%',
        '%中国银行%',
        '%2026旅游%',
        '%支出%',
      ]),
    );
  });

  it('returns a stable cursor from the last included row', async () => {
    const rows = [
      makeRow({ id: 'tx-3', date: 300, createdAt: 30 }),
      makeRow({ id: 'tx-2', date: 200, createdAt: 20 }),
      makeRow({ id: 'tx-1', date: 100, createdAt: 10 }),
    ];
    setupSelect(rows);

    const result = await searchTransactions({ query: '餐饮', pageSize: 2 });

    expect(result.items.map((item) => item.id)).toEqual(['tx-3', 'tx-2']);
    expect(result.items[0]).not.toHaveProperty('createdAt');
    expect(result.nextCursor).toEqual({ date: 200, createdAt: 20, id: 'tx-2' });
  });

  it('applies all cursor tie-breakers to the next page query', async () => {
    const builder = setupSelect([]);

    await searchTransactions({
      query: '餐饮',
      cursor: { date: 200, createdAt: 20, id: 'tx-2' },
    });

    const compiled = new SQLiteSyncDialect().sqlToQuery(builder.where.mock.calls[0]![0]);
    expect(compiled.sql).toContain('"transactions"."date" < ?');
    expect(compiled.sql).toContain('"transactions"."created_at" < ?');
    expect(compiled.sql).toContain('"transactions"."id" < ?');
    expect(compiled.params).toEqual(expect.arrayContaining([200, 20, 'tx-2']));
  });
});
