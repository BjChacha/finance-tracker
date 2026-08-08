import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

jest.mock('@/db/client', () => ({
  db: {
    delete: jest.fn(),
    update: jest.fn(),
  },
  withTransaction: jest.fn(),
}));

jest.mock('@/features/categories/repository', () => ({
  ensureAdjustmentCategory: jest.fn(),
}));

jest.mock('@/features/transactions/repository', () => ({
  createTransaction: jest.fn(),
}));

import {
  accounts,
  importMappings,
  recurringRules,
  transactions,
} from '@/db/schema';
import { db, withTransaction } from '@/db/client';
import { deleteAccountCascade, updateAccountDetails } from '../repository';

const mockWhere = jest.fn().mockResolvedValue(undefined);
const mockDelete = db.delete as jest.Mock;
const mockUpdate = db.update as jest.Mock;
const mockWithTransaction = withTransaction as jest.Mock;
const mockSet = jest.fn();

describe('deleteAccountCascade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDelete.mockImplementation(() => ({ where: mockWhere }));
    mockUpdate.mockImplementation(() => ({ set: mockSet }));
    mockSet.mockImplementation(() => ({ where: mockWhere }));
    mockWhere.mockResolvedValue(undefined);
    mockWithTransaction.mockImplementation(async (callback: () => Promise<void>) => callback());
  });

  it('updates metadata without writing balance, currency, or exchange rate fields', async () => {
    await updateAccountDetails('account-1', {
      name: 'Wallet',
      type: 'cash',
      icon: 'wallet',
      color: '#10B981',
      includeInTotal: false,
    });

    expect(mockUpdate).toHaveBeenCalledWith(accounts);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Wallet',
        type: 'cash',
        icon: 'wallet',
        color: '#10B981',
        includeInTotal: 0,
        updatedAt: expect.any(Number),
      }),
    );
    const writtenFields = mockSet.mock.calls[0]![0];
    expect(writtenFields).not.toHaveProperty('initialBalance');
    expect(writtenFields).not.toHaveProperty('currency');
    expect(writtenFields).not.toHaveProperty('rateToBase');
  });

  it('deletes dependent rows and the account in one transaction', async () => {
    await deleteAccountCascade('account-1');

    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    expect(mockDelete.mock.calls.map(([table]) => table)).toEqual([
      transactions,
      recurringRules,
      importMappings,
      accounts,
    ]);
    expect(mockWhere).toHaveBeenCalledTimes(4);
  });

  it('matches both source and destination account references', async () => {
    await deleteAccountCascade('account-1');

    const dialect = new SQLiteSyncDialect();
    const transactionQuery = dialect.sqlToQuery(mockWhere.mock.calls[0]![0]);
    const recurringQuery = dialect.sqlToQuery(mockWhere.mock.calls[1]![0]);
    const mappingQuery = dialect.sqlToQuery(mockWhere.mock.calls[2]![0]);

    expect(transactionQuery.sql).toContain('"transactions"."account_id" = ?');
    expect(transactionQuery.sql).toContain('"transactions"."to_account_id" = ?');
    expect(transactionQuery.params).toEqual(['account-1', 'account-1']);
    expect(recurringQuery.sql).toContain('"recurring_rules"."account_id" = ?');
    expect(recurringQuery.sql).toContain('"recurring_rules"."to_account_id" = ?');
    expect(recurringQuery.params).toEqual(['account-1', 'account-1']);
    expect(mappingQuery.sql).toContain('"import_mappings"."kind" = ?');
    expect(mappingQuery.sql).toContain('"import_mappings"."target_id" = ?');
    expect(mappingQuery.params).toEqual(['account', 'account-1']);
  });

  it('propagates failures so the transaction can roll back', async () => {
    mockWhere.mockRejectedValueOnce(new Error('delete failed'));

    await expect(deleteAccountCascade('account-1')).rejects.toThrow('delete failed');
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
