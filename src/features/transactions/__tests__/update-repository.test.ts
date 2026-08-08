jest.mock('@/db/client', () => ({
  db: {
    update: jest.fn(),
  },
}));

import { db } from '@/db/client';
import { transactions } from '@/db/schema';
import { updateTransaction } from '../repository';

const mockUpdate = db.update as jest.Mock;
const mockSet = jest.fn();
const mockWhere = jest.fn().mockResolvedValue(undefined);

describe('updateTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockImplementation(() => ({ set: mockSet }));
    mockSet.mockImplementation(() => ({ where: mockWhere }));
  });

  it('writes the supplied historical exchange rate when unrelated fields change', async () => {
    await updateTransaction('tx-1', {
      type: 'expense',
      amount: 1_999,
      accountId: 'account-1',
      categoryId: 'category-1',
      projectId: null,
      date: 1_775_001_600_000,
      note: 'Updated note',
      currency: 'USD',
      exchangeRate: 6_760_600,
    });

    expect(mockUpdate).toHaveBeenCalledWith(transactions);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        note: 'Updated note',
        currency: 'USD',
        exchangeRate: 6_760_600,
        amountBaseCents: 13_514,
      }),
    );
  });
});
