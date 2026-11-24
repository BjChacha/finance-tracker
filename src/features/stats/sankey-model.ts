/**
 * 桑基图（资金流向）的纯数据模型。
 *
 * 拆出来是为了单测不加载数据库（jest 里 expo-sqlite 不可用），
 * 查询层在 sankey.ts。
 */

export type FlowNode = {
  id: string;
  name: string;
  color: string;
  /** 该节点承载的流量（分）；恒等于其所有 link 之和，保证缎带宽度不溢出 */
  total: number;
};

export type FlowLink = { source: string; target: string; value: number };

export type MoneyFlow = {
  /** 左侧：账户（流量降序，「其他」置末） */
  left: FlowNode[];
  /** 右侧：分类（流量降序，「其他」置末） */
  right: FlowNode[];
  links: FlowLink[];
  /** 总流量（分） */
  total: number;
  /** 被并入「其他」的账户 / 分类个数 */
  truncatedLeft: number;
  truncatedRight: number;
};

export type FlowRow = {
  accountId: string;
  accountName: string;
  accountColor: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  /** 本位币分 */
  total: number;
};

export const OTHER_NODE_ID = '__other__';
export const OTHER_NODE_NAME = '其他';
const OTHER_NODE_COLOR = '#9CA3AF';

type Totals = Map<string, { name: string; color: string; total: number }>;

function accumulate(
  target: Totals,
  id: string,
  name: string,
  color: string,
  value: number,
) {
  let entry = target.get(id);
  if (!entry) {
    entry = { name, color, total: 0 };
    target.set(id, entry);
  }
  entry.total += value;
}

/** 取流量最大的 n 个 id；其余归入 OTHER。返回保留集合与「其他」总量 */
function pickTop(totals: Totals, max: number) {
  const ranked = [...totals.entries()].sort((a, b) => b[1].total - a[1].total);
  const kept = new Set(ranked.slice(0, Math.max(1, max)).map(([id]) => id));
  const overflow = ranked.length - kept.size;
  return { kept, overflow };
}

/**
 * 纯函数：账户×分类 的金额明细 → 桑基数据。
 *
 * 两侧都只保留最大的若干个节点，其余折叠成「其他」：手机上二十多个账户
 * 乘二十多个分类会得到几百条缎带，完全不可读。折叠阈值取得很小（默认 5 / 6），
 * 让「谁占大头」一眼可见。
 */
export function aggregateMoneyFlow(
  rows: readonly FlowRow[],
  opts?: { maxLeft?: number; maxRight?: number },
): MoneyFlow {
  const maxLeft = opts?.maxLeft ?? 5;
  const maxRight = opts?.maxRight ?? 6;

  const accountTotals: Totals = new Map();
  const categoryTotals: Totals = new Map();
  for (const row of rows) {
    if (!(row.total > 0)) continue;
    accumulate(accountTotals, row.accountId, row.accountName, row.accountColor, row.total);
    accumulate(categoryTotals, row.categoryId, row.categoryName, row.categoryColor, row.total);
  }

  const accounts = pickTop(accountTotals, maxLeft);
  const categories = pickTop(categoryTotals, maxRight);
  const hasOtherLeft = accounts.overflow > 0;
  const hasOtherRight = categories.overflow > 0;

  // 折叠后重新累计 link，保证 node.total 与 link 之和严格一致
  const linkTotals = new Map<string, number>();
  for (const row of rows) {
    if (!(row.total > 0)) continue;
    const source = accounts.kept.has(row.accountId) ? row.accountId : OTHER_NODE_ID;
    const target = categories.kept.has(row.categoryId) ? row.categoryId : OTHER_NODE_ID;
    const key = `${source}\u0000${target}`;
    linkTotals.set(key, (linkTotals.get(key) ?? 0) + row.total);
  }

  // 必须按「侧」分开累计：'__other__' 同时可能出现在左右两侧，
  // 用裸 id 做 key 会让左「其他」把右「其他」的金额也吃进来（宽度翻倍）
  const nodeTotals = new Map<string, number>();
  for (const [key, value] of linkTotals) {
    const [source, target] = key.split('\u0000') as [string, string];
    nodeTotals.set(`L:${source}`, (nodeTotals.get(`L:${source}`) ?? 0) + value);
    nodeTotals.set(`R:${target}`, (nodeTotals.get(`R:${target}`) ?? 0) + value);
  }

  const order = (totals: Totals, kept: Set<string>) => {
    const ranked = [...totals.entries()].sort((a, b) => b[1].total - a[1].total);
    return ranked.filter(([id]) => kept.has(id)).map(([id]) => id);
  };
  const leftOrder = order(accountTotals, accounts.kept);
  const rightOrder = order(categoryTotals, categories.kept);
  if (hasOtherLeft) leftOrder.push(OTHER_NODE_ID);
  if (hasOtherRight) rightOrder.push(OTHER_NODE_ID);

  const buildNode = (
    side: 'L' | 'R',
    id: string,
    totals: Totals,
    fallbackColor: string,
    fallbackName: string,
  ): FlowNode => {
    const entry = totals.get(id);
    return {
      id,
      name: id === OTHER_NODE_ID ? OTHER_NODE_NAME : (entry?.name ?? fallbackName),
      color: id === OTHER_NODE_ID ? OTHER_NODE_COLOR : (entry?.color ?? fallbackColor),
      total: nodeTotals.get(`${side}:${id}`) ?? 0,
    };
  };

  const left = leftOrder.map((id) =>
    buildNode('L', id, accountTotals, OTHER_NODE_COLOR, id),
  );
  const right = rightOrder.map((id) =>
    buildNode('R', id, categoryTotals, OTHER_NODE_COLOR, id),
  );

  const leftIndex = new Map(left.map((node, at) => [node.id, at]));
  const rightIndex = new Map(right.map((node, at) => [node.id, at]));
  const links: FlowLink[] = [...linkTotals.entries()]
    .map(([key, value]) => {
      const [source, target] = key.split('\u0000') as [string, string];
      return { source, target, value };
    })
    // 排序让缎带顺序稳定（同源/同目标的相邻），减少视觉交叉
    .sort(
      (a, b) =>
        (leftIndex.get(a.source) ?? 0) - (leftIndex.get(b.source) ?? 0) ||
        (rightIndex.get(a.target) ?? 0) - (rightIndex.get(b.target) ?? 0),
    );

  return {
    left,
    right,
    links,
    total: links.reduce((sum, link) => sum + link.value, 0),
    truncatedLeft: hasOtherLeft ? accounts.overflow : 0,
    truncatedRight: hasOtherRight ? categories.overflow : 0,
  };
}
