// Pure-function tests: stub the db client so importing repository does not
// initialise expo-sqlite (unavailable under jest/node).
jest.mock('@/db/client', () => ({ db: {} }));

import { computeAllocation, validateBudgetAllocation } from '../repository';

describe('computeAllocation', () => {
  it('returns null when there is no total-budget row', () => {
    expect(computeAllocation([{ categoryId: 'c1', amount: 100 }])).toBeNull();
    expect(computeAllocation([])).toBeNull();
  });

  it('sums category allocations under the total', () => {
    const out = computeAllocation([
      { categoryId: null, amount: 10000 },
      { categoryId: 'c1', amount: 3000 },
      { categoryId: 'c2', amount: 2500 },
    ]);
    expect(out).toEqual({ totalAmount: 10000, allocated: 5500, toAllocate: 4500 });
  });

  it('reports zero to-allocate when fully allocated', () => {
    const out = computeAllocation([
      { categoryId: null, amount: 5000 },
      { categoryId: 'c1', amount: 5000 },
    ]);
    expect(out).toEqual({ totalAmount: 5000, allocated: 5000, toAllocate: 0 });
  });

  it('ignores total order / multiple categories', () => {
    const out = computeAllocation([
      { categoryId: 'c2', amount: 200 },
      { categoryId: null, amount: 1000 },
      { categoryId: 'c1', amount: 300 },
    ]);
    expect(out).toEqual({ totalAmount: 1000, allocated: 500, toAllocate: 500 });
  });
});

describe('validateBudgetAllocation', () => {
  it('rejects non-positive or non-integer amounts', () => {
    const base = { totalAmount: 10000, othersAllocated: 0 };
    expect(validateBudgetAllocation({ categoryId: null, amount: 0 }, base)).toBe('额度必须为正数');
    expect(validateBudgetAllocation({ categoryId: 'c1', amount: -5 }, base)).toBe('额度必须为正数');
    expect(
      validateBudgetAllocation({ categoryId: 'c1', amount: 1.5 }, base),
    ).toBe('额度必须为正数');
  });

  it('total budget may equal the current category sum', () => {
    expect(
      validateBudgetAllocation(
        { categoryId: null, amount: 5000 },
        { totalAmount: 0, othersAllocated: 5000 },
      ),
    ).toBeNull();
  });

  it('total budget below the category sum is rejected', () => {
    const err = validateBudgetAllocation(
      { categoryId: null, amount: 4000 },
      { totalAmount: 0, othersAllocated: 5000 },
    );
    expect(err).toMatch(/总预算不能低于/);
  });

  it('category budget requires an existing total', () => {
    const err = validateBudgetAllocation(
      { categoryId: 'c1', amount: 100 },
      { totalAmount: null, othersAllocated: 0 },
    );
    expect(err).toBe('请先设置该周期的总预算');
  });

  it('category budget within remaining passes', () => {
    expect(
      validateBudgetAllocation(
        { categoryId: 'c1', amount: 3000 },
        { totalAmount: 10000, othersAllocated: 5000 },
      ),
    ).toBeNull();
  });

  it('category budget exactly exhausting remaining passes', () => {
    expect(
      validateBudgetAllocation(
        { categoryId: 'c1', amount: 5000 },
        { totalAmount: 10000, othersAllocated: 5000 },
      ),
    ).toBeNull();
  });

  it('category budget over remaining is rejected', () => {
    const err = validateBudgetAllocation(
      { categoryId: 'c1', amount: 5001 },
      { totalAmount: 10000, othersAllocated: 5000 },
    );
    expect(err).toMatch(/超出待分配额度/);
  });
});
