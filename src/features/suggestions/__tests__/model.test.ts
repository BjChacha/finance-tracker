import {
  AUTO_SELECT_MIN_SCORE,
  BASELINE_VERSION,
  buildBaseline,
  CANDIDATE_MIN_SCORE,
  MAX_AMOUNTS_PER_TARGET,
  orderByScore,
  orderTree,
  pickAutoSelect,
  pickAutoSelectId,
  pickAutoSelectTransferPair,
  scoreAccounts,
  scoreCategories,
  scoreTransferPairs,
  shouldRebuild,
  transferDestinationScores,
  transferSourceScores,
  type Baseline,
  type BaselineRow,
  type StoredBaseline,
} from '../model';

const TODAY = '2026-07-12';

function row(
  type: 'expense' | 'income',
  categoryId: string,
  amount: number,
  dateKey: string,
  accountId = 'default-account',
): BaselineRow {
  return { type, categoryId, accountId, toAccountId: null, amount, dateKey };
}

describe('buildBaseline', () => {
  it('空输入返回空基线且带版本号', () => {
    const b = buildBaseline([]);
    expect(b.v).toBe(BASELINE_VERSION);
    expect(b.entries.expense).toEqual([]);
    expect(b.entries.income).toEqual([]);
  });

  it('按 type 与分类聚合,金额去重计数,lastDateKey 取最近', () => {
    const b = buildBaseline([
      row('expense', 'coffee', 1500, '2026-06-01'),
      row('expense', 'coffee', 1500, '2026-06-05'),
      row('expense', 'coffee', 2000, '2026-06-03'),
      row('income', 'salary', 500000, '2026-06-10'),
    ]);
    expect(b.entries.expense).toHaveLength(1);
    expect(b.entries.income).toHaveLength(1);

    const coffee = b.entries.expense[0];
    expect(coffee.categoryId).toBe('coffee');
    expect(coffee.count).toBe(3);
    const amount1500 = coffee.amounts.find((a) => a.cents === 1500);
    expect(amount1500).toMatchObject({ count: 2, lastDateKey: '2026-06-05' });
    expect(coffee.amounts.find((a) => a.cents === 2000)).toMatchObject({
      count: 1,
      lastDateKey: '2026-06-03',
    });
  });

  it('每分类金额表按 count 降序、lastDateKey 降序截断到上限', () => {
    const rows: BaselineRow[] = [];
    // cents=100 出现 2 次(应排第一);其余 41 个金额各 1 次,其中 cents=4200 日期最旧(应被截掉)
    rows.push(row('expense', 'shop', 100, '2026-06-01'));
    rows.push(row('expense', 'shop', 100, '2026-06-02'));
    for (let i = 1; i <= 40; i++) {
      rows.push(row('expense', 'shop', 100 + i * 100, '2026-06-10'));
    }
    rows.push(row('expense', 'shop', 4200, '2026-05-01'));

    const entry = buildBaseline(rows).entries.expense[0];
    expect(entry.amounts).toHaveLength(MAX_AMOUNTS_PER_TARGET);
    expect(entry.amounts[0]).toMatchObject({ cents: 100, count: 2 });
    expect(entry.amounts.some((a) => a.cents === 4200)).toBe(false);
    expect(entry.count).toBe(43); // 截断只影响金额表,总笔数保留
  });

  it('builds account entries and keeps transfer pairs directional', () => {
    const baseline = buildBaseline([
      row('expense', 'coffee', 1500, '2026-07-10', 'wallet'),
      row('income', 'salary', 500000, '2026-07-10', 'bank'),
      {
        type: 'transfer',
        categoryId: null,
        accountId: 'wallet',
        toAccountId: 'bank',
        amount: 3000,
        dateKey: '2026-07-11',
      },
      {
        type: 'transfer',
        categoryId: null,
        accountId: 'bank',
        toAccountId: 'wallet',
        amount: 3000,
        dateKey: '2026-07-11',
      },
    ]);

    expect(baseline.accountEntries.expense[0]).toMatchObject({ accountId: 'wallet', count: 1 });
    expect(baseline.accountEntries.income[0]).toMatchObject({ accountId: 'bank', count: 1 });
    expect(baseline.transferPairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: 'wallet', toAccountId: 'bank' }),
        expect.objectContaining({ accountId: 'bank', toAccountId: 'wallet' }),
      ]),
    );
  });
});

describe('scoreCategories', () => {
  it('精确命中 > 相近金额;远离金额被候选门槛过滤', () => {
    const b = buildBaseline([
      row('expense', 'exact', 1500, '2026-07-11'),
      row('expense', 'near', 1650, '2026-07-11'), // +10%
      row('expense', 'far', 3000, '2026-07-11'), // 2 倍
    ]);
    const scores = scoreCategories(b, 'expense', 1500, TODAY);
    const exact = scores.get('exact')!;
    const near = scores.get('near')!;
    expect(exact).toBeGreaterThan(near);
    expect(near).toBeGreaterThanOrEqual(CANDIDATE_MIN_SCORE);
    expect(scores.has('far')).toBe(false);
  });

  it('同金额同日期下,频次高的分类得分更高', () => {
    const rows: BaselineRow[] = [];
    for (let i = 0; i < 5; i++) rows.push(row('expense', 'often', 2000, '2026-07-10'));
    rows.push(row('expense', 'once', 2000, '2026-07-10'));
    const scores = scoreCategories(buildBaseline(rows), 'expense', 2000, TODAY);
    expect(scores.get('often')!).toBeGreaterThan(scores.get('once')!);
  });

  it('近期衰减:45 天半衰期,今天得分约为 45 天前的 2 倍', () => {
    const b = buildBaseline([
      row('expense', 'fresh', 1000, '2026-07-12'), // 0 天前
      row('expense', 'stale', 1000, '2026-05-28'), // 45 天前
    ]);
    const scores = scoreCategories(b, 'expense', 1000, TODAY);
    expect(scores.get('fresh')! / scores.get('stale')!).toBeCloseTo(2, 5);
  });

  it('expense 与 income 相互隔离', () => {
    const b = buildBaseline([
      row('income', 'salary', 1500, '2026-07-11'),
      row('expense', 'coffee', 1500, '2026-07-11'),
    ]);
    const expenseScores = scoreCategories(b, 'expense', 1500, TODAY);
    expect(expenseScores.has('salary')).toBe(false);
    expect(expenseScores.has('coffee')).toBe(true);
    const incomeScores = scoreCategories(b, 'income', 1500, TODAY);
    expect(incomeScores.has('salary')).toBe(true);
    expect(incomeScores.has('coffee')).toBe(false);
  });

  it('金额非正数返回空结果', () => {
    const b = buildBaseline([row('expense', 'coffee', 1500, '2026-07-11')]);
    expect(scoreCategories(b, 'expense', 0, TODAY).size).toBe(0);
    expect(scoreCategories(b, 'expense', -100, TODAY).size).toBe(0);
  });
});

describe('account suggestions', () => {
  const baseline = buildBaseline([
    row('expense', 'coffee', 1500, '2026-07-11', 'wallet'),
    row('expense', 'coffee', 3000, '2026-07-11', 'bank'),
    {
      type: 'transfer',
      categoryId: null,
      accountId: 'wallet',
      toAccountId: 'bank',
      amount: 5000,
      dateKey: '2026-07-11',
    },
    {
      type: 'transfer',
      categoryId: null,
      accountId: 'bank',
      toAccountId: 'wallet',
      amount: 9000,
      dateKey: '2026-07-11',
    },
  ]);

  it('scores single accounts with the shared amount kernel', () => {
    const scores = scoreAccounts(baseline, 'expense', 1500, TODAY);
    expect(scores.get('wallet')).toBeGreaterThanOrEqual(AUTO_SELECT_MIN_SCORE);
    expect(scores.has('bank')).toBe(false);
  });

  it('scores and orders transfer sources and destinations by directed pair', () => {
    const pairs = scoreTransferPairs(baseline, 5000, TODAY);
    expect(pairs[0]).toMatchObject({ accountId: 'wallet', toAccountId: 'bank' });
    expect(transferSourceScores(pairs).get('wallet')).toBe(pairs[0].score);
    expect(transferDestinationScores(pairs, 'wallet').get('bank')).toBe(pairs[0].score);
    expect(transferDestinationScores(pairs, 'bank').has('wallet')).toBe(false);
  });

  it('stably orders accounts and auto-selects only valid targets above threshold', () => {
    const accounts = [{ id: 'cash' }, { id: 'wallet' }, { id: 'bank' }];
    const scores = new Map([
      ['bank', 1],
      ['wallet', 2],
    ]);
    expect(orderByScore(accounts, scores).map(({ id }) => id)).toEqual([
      'wallet',
      'bank',
      'cash',
    ]);
    expect(pickAutoSelectId(accounts, scores)).toBe('wallet');

    const pairs = scoreTransferPairs(baseline, 5000, TODAY);
    expect(pickAutoSelectTransferPair(pairs, new Set(['wallet', 'bank']))).toMatchObject({
      accountId: 'wallet',
      toAccountId: 'bank',
    });
    expect(pickAutoSelectTransferPair(pairs, new Set(['wallet']))).toBeNull();
  });
});

/** 最小结构的分类树 fixture(结构兼容 CategoryNode) */
function node(id: string, children: { id: string }[] = []) {
  return { id, children };
}

describe('orderTree', () => {
  const tree = [node('p1'), node('p2', [node('c21'), node('c22')]), node('p3'), node('p4')];

  it('候选按得分降序排前,其余保持原顺序;子分类同理', () => {
    const scores = new Map([
      ['c22', 2],
      ['p4', 1],
    ]);
    const ordered = orderTree(tree, scores);
    expect(ordered.map((n) => n.id)).toEqual(['p2', 'p4', 'p1', 'p3']); // p2 聚合子分类 c22 的分
    expect(ordered[0].children.map((c) => c.id)).toEqual(['c22', 'c21']);
  });

  it('父分类得分取 max(自身, 子分类最高分)', () => {
    const scores = new Map([
      ['p1', 1.5],
      ['p2', 0.2],
      ['c21', 1 ],
    ]);
    // p2 聚合后 = max(0.2, 1) = 1 < p1 的 1.5
    expect(orderTree(tree, scores).map((n) => n.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('scores 中不在树里的 id 被忽略;空 scores 保持原序;不修改原数组', () => {
    const ghost = new Map([['ghost', 9]]);
    expect(orderTree(tree, ghost).map((n) => n.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(orderTree(tree, new Map()).map((n) => n.id)).toEqual(['p1', 'p2', 'p3', 'p4']);

    const scores = new Map([['p4', 1]]);
    orderTree(tree, scores);
    expect(tree.map((n) => n.id)).toEqual(['p1', 'p2', 'p3', 'p4']); // 原树未被改动
  });
});

describe('pickAutoSelect', () => {
  const tree = [node('p1'), node('p2', [node('c21'), node('c22')]), node('p3')];

  it('最高分低于自动预选门槛时返回 null', () => {
    const scores = new Map([['p1', AUTO_SELECT_MIN_SCORE - 0.01]]);
    expect(pickAutoSelect(tree, scores)).toBeNull();
    expect(pickAutoSelect(tree, new Map())).toBeNull();
  });

  it('命中子分类:返回子分类 id 与其父 id 供展开', () => {
    const scores = new Map([
      ['p1', 0.5],
      ['c22', 3],
    ]);
    expect(pickAutoSelect(tree, scores)).toEqual({ categoryId: 'c22', expandParentId: 'p2' });
  });

  it('命中有子分类的父分类:expandParentId 为自身;无子分类则为 null', () => {
    expect(pickAutoSelect(tree, new Map([['p2', 1]]))).toEqual({
      categoryId: 'p2',
      expandParentId: 'p2',
    });
    expect(pickAutoSelect(tree, new Map([['p1', 1]]))).toEqual({
      categoryId: 'p1',
      expandParentId: null,
    });
  });

  it('scores 中已不在树里的 id(删除/归档)被跳过,取树内次高分', () => {
    const scores = new Map([
      ['ghost', 9],
      ['p1', 1],
    ]);
    expect(pickAutoSelect(tree, scores)).toEqual({ categoryId: 'p1', expandParentId: null });
  });
});

describe('shouldRebuild', () => {
  const baseline: Baseline = {
    v: BASELINE_VERSION,
    entries: { expense: [], income: [] },
    accountEntries: { expense: [], income: [] },
    transferPairs: [],
  };
  const stored: StoredBaseline = {
    baseline,
    meta: { builtAt: 1000, txCount: 10, maxUpdatedAt: 99 },
  };

  it('无存储或版本不符时需要重建', () => {
    expect(shouldRebuild(null, { count: 10, maxUpdatedAt: 99 })).toBe(true);
    const oldVersion: StoredBaseline = { ...stored, baseline: { ...baseline, v: 0 as never } };
    expect(shouldRebuild(oldVersion, { count: 10, maxUpdatedAt: 99 })).toBe(true);
  });

  it('交易签名(笔数或最后更新时间)变化时需要重建', () => {
    expect(shouldRebuild(stored, { count: 11, maxUpdatedAt: 99 })).toBe(true);
    expect(shouldRebuild(stored, { count: 10, maxUpdatedAt: 100 })).toBe(true);
  });

  it('版本与签名完全一致时无需重建', () => {
    expect(shouldRebuild(stored, { count: 10, maxUpdatedAt: 99 })).toBe(false);
  });
});
