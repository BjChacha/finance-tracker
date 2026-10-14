const mockSelectChain = (rows: unknown[]) => {
  const chain = {
    from: () => chain,
    where: () => chain,
    then: (resolve: (value: unknown[]) => void) => Promise.resolve(rows).then(resolve),
  };
  return chain;
};

const mockInsertValues = jest.fn((_value: unknown) => ({
  onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/client', () => ({
  db: {
    select: jest.fn(() => mockSelectChain([])),
    insert: jest.fn(() => ({ values: mockInsertValues })),
  },
  withTransaction: jest.fn((run: () => Promise<void>) => run()),
}));

jest.mock('@/features/categories', () => ({
  listCategoryTree: jest.fn(),
  createCategory: jest.fn(),
}));

jest.mock('@/features/accounts', () => ({
  listAccountsWithBalance: jest.fn(),
  createAccount: jest.fn(),
}));

import { listAccountsWithBalance } from '@/features/accounts';
import { listCategoryTree } from '@/features/categories';
import { createRegistry } from '../registry';
import { ImportSession, mappingKey } from '../pipeline';
import type { ImportAdapter, NormalizedTransaction } from '../types';

const mockListCategoryTree = listCategoryTree as jest.Mock;
const mockListAccountsWithBalance = listAccountsWithBalance as jest.Mock;

function category(id: string, name: string, type: 'expense' | 'income' | 'transfer') {
  return {
    id,
    name,
    type,
    icon: 'package',
    color: '#9CA3AF',
    parentId: null,
    sortOrder: 0,
    isPreset: 1,
    archived: 0,
    children: [],
  };
}

function arrangeCategories(): void {
  mockListCategoryTree.mockImplementation((type: string) => {
    if (type === 'expense') return Promise.resolve([category('other-expense', '其他支出', 'expense')]);
    if (type === 'income') return Promise.resolve([category('other-income', '其他收入', 'income')]);
    return Promise.resolve([
      category('account-transfer', '账户互转', 'transfer'),
      category('bill-repayment', '账单还款', 'transfer'),
      category('withdrawal', '取钱', 'transfer'),
      category('other-transfer', '其他', 'transfer'),
    ]);
  });
}

async function createSession(transactions: NormalizedTransaction[]): Promise<ImportSession> {
  const adapter: ImportAdapter = {
    id: 'test-transfer',
    displayName: 'Test',
    fileExtensions: ['.csv'],
    detect: async () => ({ confidence: 1 }),
    parse: async () => ({ transactions, issues: [] }),
  };
  const registry = createRegistry();
  registry.register(adapter);
  const session = new ImportSession(registry);
  session.pickFile({ uri: 'file:///test.csv', name: 'test.csv', size: 1 });
  session.setAdapter(adapter.id);
  await session.parse();
  return session;
}

describe('transfer category import mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    arrangeCategories();
    mockListAccountsWithBalance.mockResolvedValue([
      { id: 'bank', name: 'Bank' },
      { id: 'card', name: 'Card' },
      { id: 'cash', name: 'Cash' },
    ]);
  });

  it('suggests transfer aliases and defaults missing categories to Other', async () => {
    const session = await createSession([
      {
        direction: 'transfer',
        amountCents: 50000,
        date: '2026-08-01',
        rawCategory: '信用卡还款',
        rawAccount: 'Bank',
        rawToAccount: 'Card',
      },
      {
        direction: 'transfer',
        amountCents: 10000,
        date: '2026-08-02',
        rawCategory: '提现',
        rawAccount: 'Bank',
        rawToAccount: 'Cash',
      },
      {
        direction: 'transfer',
        amountCents: 20000,
        date: '2026-08-03',
        rawAccount: 'Bank',
        rawToAccount: 'Cash',
      },
    ]);

    const plan = await session.buildMappingPlan();
    const suggestionFor = (label: string) =>
      plan.categories.find(
        (item) => item.categoryType === 'transfer' && item.sourceLabel === label,
      )?.suggestion;

    expect(suggestionFor('信用卡还款')).toMatchObject({
      action: 'existing',
      targetId: 'bill-repayment',
    });
    expect(suggestionFor('提现')).toMatchObject({ action: 'existing', targetId: 'withdrawal' });
    expect(suggestionFor('')).toEqual({
      action: 'existing',
      targetId: 'other-transfer',
      via: 'default',
    });

    const repayment = plan.categories.find((item) => item.sourceLabel === '信用卡还款')!;
    session.applyMapping(
      new Map([[mappingKey(repayment), { action: 'existing', targetId: 'account-transfer' }]]),
    );
  });

  it('downgrades a same-account transfer to expense with Other Expense', async () => {
    mockListAccountsWithBalance.mockResolvedValue([
      { id: 'same-account', name: 'Bank' },
      { id: 'same-account', name: 'Alias' },
    ]);
    const session = await createSession([
      {
        direction: 'transfer',
        amountCents: 50000,
        date: '2026-08-01',
        rawCategory: '账户互转',
        rawAccount: 'Bank',
        rawToAccount: 'Alias',
      },
    ]);

    await session.buildMappingPlan();
    await session.dedupe();
    await session.commit();

    const insertedTransactions = mockInsertValues.mock.calls
      .map(([value]) => value)
      .find(
        (value) =>
          Array.isArray(value) &&
          value.length > 0 &&
          typeof value[0] === 'object' &&
          value[0] !== null &&
          'fingerprint' in value[0],
      ) as Array<Record<string, unknown>>;
    expect(insertedTransactions[0]).toMatchObject({
      type: 'expense',
      categoryId: 'other-expense',
      toAccountId: null,
      toAmount: null,
    });
  });
});
