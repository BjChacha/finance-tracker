jest.mock('@/db/client', () => ({
  db: {},
  withTransaction: jest.fn(),
}));

import type { RecurringRule } from '@/db/schema';
import {
  ruleToTxValues,
  validateRecurringInput,
  type RecurringInput,
} from '../repository';

const validTransferInput: RecurringInput = {
  name: 'Card repayment',
  type: 'transfer',
  amount: 50000,
  accountId: 'bank',
  toAccountId: 'credit-card',
  categoryId: 'bill-repayment',
  note: '',
  frequency: 'monthly',
  interval: 1,
  anchor: 10,
  startDate: '2026-08-10',
  endDate: null,
  autoCreate: true,
};

describe('recurring transfer categories', () => {
  it('requires a category for transfer rules', () => {
    expect(() =>
      validateRecurringInput({ ...validTransferInput, categoryId: '' }),
    ).toThrow('请选择分类');
    expect(() => validateRecurringInput(validTransferInput)).not.toThrow();
  });

  it('copies the rule category to generated transfer transactions', () => {
    const rule: RecurringRule = {
      id: 'rule',
      ...validTransferInput,
      autoCreate: 1,
      enabled: 1,
      nextRunDate: '2026-08-10',
      lastRunDate: null,
      createdAt: 1,
      updatedAt: 1,
    };

    expect(ruleToTxValues(rule, '2026-08-10').categoryId).toBe('bill-repayment');
  });
});
