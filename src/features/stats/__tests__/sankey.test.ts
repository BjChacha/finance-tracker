import {
  aggregateMoneyFlow,
  OTHER_NODE_ID,
  type FlowRow,
} from '../sankey-model';

const row = (
  accountId: string,
  categoryId: string,
  total: number,
  accountName = accountId,
  categoryName = categoryId,
): FlowRow => ({
  accountId,
  accountName,
  accountColor: '#111111',
  categoryId,
  categoryName,
  categoryColor: '#222222',
  total,
});

/** 每个 link 都必须在两侧节点的高度预算内 —— 节点 total 恒等于其 link 之和 */
function assertNodeTotalsMatchLinks(flow: ReturnType<typeof aggregateMoneyFlow>) {
  for (const node of flow.left) {
    const sum = flow.links
      .filter((link) => link.source === node.id)
      .reduce((acc, link) => acc + link.value, 0);
    expect(sum).toBe(node.total);
  }
  for (const node of flow.right) {
    const sum = flow.links
      .filter((link) => link.target === node.id)
      .reduce((acc, link) => acc + link.value, 0);
    expect(sum).toBe(node.total);
  }
  expect(flow.total).toBe(flow.links.reduce((sum, link) => sum + link.value, 0));
}

describe('aggregateMoneyFlow', () => {
  it('按账户/分类聚合，节点降序，link 保留明细', () => {
    const flow = aggregateMoneyFlow([
      row('cash', 'food', 300),
      row('cash', 'traffic', 100),
      row('card', 'food', 600),
    ]);
    expect(flow.left.map((node) => node.id)).toEqual(['card', 'cash']);
    expect(flow.right.map((node) => node.id)).toEqual(['food', 'traffic']);
    expect(flow.total).toBe(1000);
    expect(flow.links).toHaveLength(3);
    expect(flow.truncatedLeft).toBe(0);
    expect(flow.truncatedRight).toBe(0);
    assertNodeTotalsMatchLinks(flow);
  });

  it('超过阈值的两侧都折叠成「其他」，且「其他」排在末尾', () => {
    const flow = aggregateMoneyFlow(
      [
        row('a', 'x', 500),
        row('b', 'y', 400),
        row('c', 'z', 300),
        row('d', 'w', 200),
      ],
      { maxLeft: 2, maxRight: 2 },
    );
    expect(flow.left.map((node) => node.id)).toEqual(['a', 'b', OTHER_NODE_ID]);
    expect(flow.right.map((node) => node.id)).toEqual(['x', 'y', OTHER_NODE_ID]);
    expect(flow.truncatedLeft).toBe(2);
    expect(flow.truncatedRight).toBe(2);
    // 折叠不丢金额
    expect(flow.total).toBe(1400);
    expect(flow.left[2]!.total).toBe(500); // c + d
    assertNodeTotalsMatchLinks(flow);
  });

  it('折叠后的「其他」名称是「其他」而不是原始 id', () => {
    const flow = aggregateMoneyFlow(
      [row('a', 'x', 500), row('b', 'y', 400)],
      { maxLeft: 1, maxRight: 1 },
    );
    const other = flow.left.find((node) => node.id === OTHER_NODE_ID)!;
    expect(other.name).toBe('其他');
    expect(other.color).toBeTruthy();
  });

  it('零与负数金额被忽略（退款净额可能为负，不应产生负宽度）', () => {
    const flow = aggregateMoneyFlow([
      row('cash', 'food', 300),
      row('cash', 'refund', 0),
      row('card', 'refund', -50),
    ]);
    expect(flow.total).toBe(300);
    expect(flow.links.every((link) => link.value > 0)).toBe(true);
    expect(flow.right.map((node) => node.id)).toEqual(['food']);
  });

  it('空输入返回空结构而不是抛错', () => {
    const flow = aggregateMoneyFlow([]);
    expect(flow).toEqual({
      left: [],
      right: [],
      links: [],
      total: 0,
      truncatedLeft: 0,
      truncatedRight: 0,
    });
  });

  it('link 顺序稳定（按源节点序、再按目标节点序），缎带顺序可复现', () => {
    const flow = aggregateMoneyFlow([
      row('b', 'y', 10),
      row('a', 'x', 10),
      row('a', 'y', 10),
    ]);
    // 账户降序 a,b；分类降序 y,x
    expect(flow.links.map((link) => `${link.source}->${link.target}`)).toEqual([
      'a->y',
      'a->x',
      'b->y',
    ]);
  });
});
