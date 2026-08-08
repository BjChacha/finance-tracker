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
import { migrateMealCategoriesOnce } from '@/db/seed';

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
