import type { FlowNode, MoneyFlow } from '../sankey-model';

/**
 * 桑基图的几何布局（纯函数，可单测）。
 *
 * 两列节点 + 连接缎带。左侧按账户、右侧按分类，节点高度按流量占比分配，
 * 缎带在同一节点的高度内**顺序堆叠**——这是桑基图能读出「哪条流更粗」的前提，
 * 重叠会让宽度失去意义。
 */

export type SankeyNodeBox = {
  id: string;
  name: string;
  color: string;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
  side: 'left' | 'right';
};

export type SankeyRibbon = {
  id: string;
  /** SVG path（三次贝塞尔带） */
  path: string;
  color: string;
  value: number;
  opacity: number;
};

/** 节点最小可见高度：低于这个值名称与缎带都无从辨认 */
const MIN_NODE_HEIGHT = 3;
const RIBBON_OPACITY = 0.28;

export function sankeyLayout(
  flow: Pick<MoneyFlow, 'left' | 'right' | 'links'>,
  width: number,
  height: number,
  opts?: { nodeWidth?: number; nodeGap?: number; paddingY?: number },
): { nodes: SankeyNodeBox[]; ribbons: SankeyRibbon[] } {
  const nodeWidth = opts?.nodeWidth ?? 12;
  const nodeGap = opts?.nodeGap ?? 8;
  const paddingY = opts?.paddingY ?? 10;

  if (!(width > 0) || !(height > 0)) return { nodes: [], ribbons: [] };
  if (flow.left.length === 0 || flow.right.length === 0) {
    return { nodes: [], ribbons: [] };
  }
  const available = height - paddingY * 2;
  if (available <= 0) return { nodes: [], ribbons: [] };

  const layoutSide = (side: 'left' | 'right', nodes: readonly FlowNode[]) => {
    const total = nodes.reduce((sum, node) => sum + Math.max(0, node.total), 0);
    const gaps = nodeGap * Math.max(0, nodes.length - 1);
    const usable = Math.max(0, available - gaps);

    let heights = nodes.map((node) =>
      total > 0 ? (usable * Math.max(0, node.total)) / total : usable / Math.max(1, nodes.length),
    );
    // 把过矮的节点抬到下限，并从其余节点按「可压缩量」等比回收
    for (let pass = 0; pass < 4; pass += 1) {
      const deficit = heights.reduce(
        (sum, h) => sum + Math.max(0, MIN_NODE_HEIGHT - h),
        0,
      );
      if (deficit <= 0) break;
      const flexible = heights.reduce(
        (sum, h) => sum + Math.max(0, h - MIN_NODE_HEIGHT),
        0,
      );
      if (flexible <= 0) {
        heights = heights.map(() => usable / Math.max(1, heights.length));
        break;
      }
      heights = heights.map((h) =>
        h < MIN_NODE_HEIGHT
          ? MIN_NODE_HEIGHT
          : h - (h - MIN_NODE_HEIGHT) * (deficit / flexible),
      );
    }

    let cursor = paddingY;
    return nodes.map((node, at) => {
      const nodeHeight = Math.max(MIN_NODE_HEIGHT, heights[at]!);
      const box = {
        id: node.id,
        name: node.name,
        color: node.color,
        value: node.total,
        x: side === 'left' ? 0 : width - nodeWidth,
        y: cursor,
        width: nodeWidth,
        height: nodeHeight,
        side,
      };
      cursor += nodeHeight + nodeGap;
      return box;
    });
  };

  const leftBoxes = layoutSide('left', flow.left);
  const rightBoxes = layoutSide('right', flow.right);
  const boxes = new Map<string, SankeyNodeBox>();
  for (const box of [...leftBoxes, ...rightBoxes]) {
    // 两侧 id 空间理论上可能撞名（账户与分类同名不同 id 不会，但「其他」是共用的），
    // 用 side 前缀区分，避免缎带取错盒子
    boxes.set(`${box.side}:${box.id}`, box);
  }

  // 同一节点内的缎带顺序按对侧节点的位置排，视觉上减少交叉
  const rightOrder = new Map(flow.right.map((node, at) => [node.id, at]));
  const bySource = new Map<string, typeof flow.links>();
  for (const link of flow.links) {
    if (!(link.value > 0)) continue;
    if (!bySource.has(link.source)) bySource.set(link.source, []);
    bySource.get(link.source)!.push(link);
  }
  for (const list of bySource.values()) {
    list.sort(
      (a, b) => (rightOrder.get(a.target) ?? 0) - (rightOrder.get(b.target) ?? 0),
    );
  }

  // 按左列节点顺序遍历、组内按右列位置排序：这样源侧与目标侧的堆叠顺序
  // 同时自然形成，缎带不会互相穿插。直接遍历入参顺序则依赖调用方自觉。
  const visited = new Set<(typeof flow.links)[number]>();
  const orderedLinks: typeof flow.links = [];
  const push = (link: (typeof flow.links)[number]) => {
    if (visited.has(link)) return;
    visited.add(link);
    orderedLinks.push(link);
  };
  for (const node of flow.left) {
    for (const link of bySource.get(node.id) ?? []) push(link);
  }
  for (const link of flow.links) {
    if (link.value > 0) push(link);
  }

  const sourceOffset = new Map<string, number>();
  const targetOffset = new Map<string, number>();
  const ribbons: SankeyRibbon[] = [];

  for (const link of orderedLinks) {
    const sourceBox = boxes.get(`left:${link.source}`);
    const targetBox = boxes.get(`right:${link.target}`);
    if (!sourceBox || !targetBox) continue;

    const sourceTotal = sourceBox.value > 0 ? sourceBox.value : link.value;
    const targetTotal = targetBox.value > 0 ? targetBox.value : link.value;
    const sourceThickness = sourceBox.height * (link.value / sourceTotal);
    const targetThickness = targetBox.height * (link.value / targetTotal);

    const sourceTop = sourceBox.y + (sourceOffset.get(link.source) ?? 0);
    const targetTop = targetBox.y + (targetOffset.get(link.target) ?? 0);
    sourceOffset.set(link.source, (sourceOffset.get(link.source) ?? 0) + sourceThickness);
    targetOffset.set(link.target, (targetOffset.get(link.target) ?? 0) + targetThickness);

    const x1 = sourceBox.x + sourceBox.width;
    const x2 = targetBox.x;
    const cx = (x1 + x2) / 2;
    const y1Top = sourceTop;
    const y1Bottom = sourceTop + sourceThickness;
    const y2Top = targetTop;
    const y2Bottom = targetTop + targetThickness;
    const round = (value: number) => Math.round(value * 100) / 100;

    ribbons.push({
      id: `${link.source}->${link.target}`,
      path:
        `M ${round(x1)} ${round(y1Top)} ` +
        `C ${round(cx)} ${round(y1Top)} ${round(cx)} ${round(y2Top)} ${round(x2)} ${round(y2Top)} ` +
        `L ${round(x2)} ${round(y2Bottom)} ` +
        `C ${round(cx)} ${round(y2Bottom)} ${round(cx)} ${round(y1Bottom)} ${round(x1)} ${round(y1Bottom)} Z`,
      color: sourceBox.color,
      value: link.value,
      opacity: RIBBON_OPACITY,
    });
  }

  return { nodes: [...leftBoxes, ...rightBoxes], ribbons };
}
