jest.mock('@/db/settings', () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn(),
}));

// 可链式 thenable 桩：drizzle 查询形如 db.select().from().where().limit()，最终 await 得到 rows。
const chainable = (rows: unknown[]) => {
  const chain: {
    from: () => unknown;
    where: () => unknown;
    limit: () => unknown;
    orderBy: () => unknown;
    then: (res: (v: unknown[]) => void) => Promise<unknown>;
  } = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    then: (res) => Promise.resolve(rows).then(res),
  };
  return chain;
};

jest.mock('@/db/client', () => ({
  db: {
    select: jest.fn(() => chainable([])),
    insert: jest.fn(),
  },
}));

// schema 桩：迁移里 eq/and 用到其字段构造条件，但桩 db 的 where() 忽略实参。
jest.mock('@/db/schema', () => ({
  accounts: {},
  categories: {
    id: 'id',
    name: 'name',
    type: 'type',
    icon: 'icon',
    color: 'color',
    parentId: 'parent_id',
    sortOrder: 'sort_order',
    isPreset: 'is_preset',
    archived: 'archived',
  },
  transactions: { categoryId: 'category_id' },
}));

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/settings';
import { migrateMealCategoriesOnce, seedIfEmpty } from '@/db/seed';

describe('seedIfEmpty', () => {
  const selectMock = db.select as jest.Mock;
  const insertMock = db.insert as jest.Mock;
  const valuesMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    selectMock.mockReset();
    insertMock.mockReset().mockReturnValue({ values: valuesMock });
    valuesMock.mockReset().mockResolvedValue(undefined);
  });

  it('seeds missing expense and income types when migration already inserted transfer presets', async () => {
    selectMock
      .mockImplementationOnce(() => chainable([{ type: 'transfer' }]))
      .mockImplementationOnce(() => chainable([{ value: 1 }]));

    await seedIfEmpty();

    const categoryRows = valuesMock.mock.calls[0]![0] as Array<{ type: string }>;
    expect(new Set(categoryRows.map((row) => row.type))).toEqual(new Set(['expense', 'income']));
    expect(categoryRows.some((row) => row.type === 'transfer')).toBe(false);
  });

  it('uses stable IDs when the transfer category type is missing', async () => {
    selectMock
      .mockImplementationOnce(() => chainable([{ type: 'expense' }, { type: 'income' }]))
      .mockImplementationOnce(() => chainable([{ value: 1 }]));

    await seedIfEmpty();

    const categoryRows = valuesMock.mock.calls[0]![0] as Array<{ id: string; type: string }>;
    expect(categoryRows.map((row) => row.id)).toEqual([
      'preset-transfer-account',
      'preset-transfer-bill-repayment',
      'preset-transfer-withdrawal',
      'preset-transfer-deposit',
      'preset-transfer-other',
    ]);
    expect(categoryRows.every((row) => row.type === 'transfer')).toBe(true);
  });
});

describe('migrateMealCategoriesOnce', () => {
  const selectMock = db.select as jest.Mock;
  const getMock = getSetting as jest.Mock;
  const setMock = setSetting as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    selectMock.mockReset();
  });

  it('已迁移（settings key=true）→ 立即返回，不查 db、不再写 settings', async () => {
    getMock.mockResolvedValueOnce(true);

    await migrateMealCategoriesOnce();

    expect(selectMock).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
  });

  it('找不到预置「餐饮」→ 不做任何改动，但仍标记完成（幂等、可重试）', async () => {
    getMock.mockResolvedValueOnce(null); // 尚未迁移
    selectMock.mockImplementation(() => chainable([])); // 餐饮查询返回空

    await migrateMealCategoriesOnce();

    expect(selectMock).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith('categories.meals.v1', true);
  });
});
