import type { QueryClient } from '@tanstack/react-query';
import { invalidateTransactionData } from '../invalidate';

describe('invalidateTransactionData', () => {
  it('invalidates the transaction prefix that owns search queries', async () => {
    const invalidateQueries = jest.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    await invalidateTransactionData(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['transactions'] });
  });
});
