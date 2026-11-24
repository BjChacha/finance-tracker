import { sankeyLayout } from '../sankey-layout';
import type { FlowLink, FlowNode } from '../../sankey-model';

const node = (id: string, total: number): FlowNode => ({
  id,
  name: id,
  color: '#123456',
  total,
});

/**
 * 从缎带 path 里取出四条纵向边。
 *
 * path 形状固定：`M x1 y1t C … L x2 y2b C … x1 y1b Z`，共 16 个数字，
 * 索引 1 = y1t、13 = y1b。测试依赖这个形状是有意的——它同时锁住了
 * 「缎带是闭合的四边形带」这个不变量。
 */
function ribbonEdges(path: string) {
  const numbers = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  expect(numbers).toHaveLength(16);
  const [x1, y1Top, , , , , x2, , , y2Bottom, , , , y1Bottom] = numbers as number[];
  return { x1: x1!, x2: x2!, y1Top: y1Top!, y1Bottom: y1Bottom!, y2Bottom: y2Bottom! };
}

const flow = (
  left: FlowNode[],
  right: FlowNode[],
  links: FlowLink[],
) => ({ left, right, links });

describe('sankeyLayout', () => {
  it('宽度或高度为 0 时返回空（不产生 NaN 坐标）', () => {
    const input = flow([node('a', 100)], [node('x', 100)], [
      { source: 'a', target: 'x', value: 100 },
    ]);
    expect(sankeyLayout(input, 0, 200)).toEqual({ nodes: [], ribbons: [] });
    expect(sankeyLayout(input, 300, 0)).toEqual({ nodes: [], ribbons: [] });
    expect(sankeyLayout(input, -10, -10)).toEqual({ nodes: [], ribbons: [] });
  });

  it('任一侧为空时返回空（没有流向可画）', () => {
    const input = flow([], [node('x', 100)], []);
    expect(sankeyLayout(input, 300, 200)).toEqual({ nodes: [], ribbons: [] });
  });

  it('节点高度按流量占比分配，且全部落在画布内', () => {
    const input = flow(
      [node('a', 300), node('b', 100)],
      [node('x', 400)],
      [
        { source: 'a', target: 'x', value: 300 },
        { source: 'b', target: 'x', value: 100 },
      ],
    );
    const { nodes } = sankeyLayout(input, 300, 200, {
      nodeWidth: 10,
      nodeGap: 8,
      paddingY: 10,
    });
    const left = nodes.filter((box) => box.side === 'left');
    expect(left).toHaveLength(2);
    // 300 : 100 → 3:1
    expect(left[0]!.height / left[1]!.height).toBeCloseTo(3, 1);
    for (const box of nodes) {
      expect(box.y).toBeGreaterThanOrEqual(10);
      expect(box.y + box.height).toBeLessThanOrEqual(200);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(300);
    }
  });

  it('同一节点的缎带在高度内顺序堆叠，厚度之和等于节点高度', () => {
    const input = flow(
      [node('a', 400)],
      [node('x', 300), node('y', 100)],
      [
        { source: 'a', target: 'x', value: 300 },
        { source: 'a', target: 'y', value: 100 },
      ],
    );
    const { nodes, ribbons } = sankeyLayout(input, 300, 240, {
      nodeWidth: 10,
      nodeGap: 8,
      paddingY: 10,
    });
    const source = nodes.find((box) => box.side === 'left' && box.id === 'a')!;
    expect(ribbons).toHaveLength(2);
    const thickness = ribbons.reduce((sum, ribbon) => {
      const edges = ribbonEdges(ribbon.path);
      const height = edges.y1Bottom - edges.y1Top;
      expect(height).toBeGreaterThan(0);
      return sum + height;
    }, 0);
    expect(thickness).toBeCloseTo(source.height, 1);
  });

  it('缎带不越界：左端在左列右缘，右端在右列左缘', () => {
    const input = flow(
      [node('a', 100)],
      [node('x', 100)],
      [{ source: 'a', target: 'x', value: 100 }],
    );
    const { nodes, ribbons } = sankeyLayout(input, 300, 200, { nodeWidth: 10 });
    const left = nodes.find((box) => box.side === 'left')!;
    const right = nodes.find((box) => box.side === 'right')!;
    const edges = ribbonEdges(ribbons[0]!.path);
    expect(edges.x1).toBeCloseTo(left.x + left.width, 1);
    expect(edges.x2).toBeCloseTo(right.x, 1);
    expect(edges.y1Top).toBeGreaterThanOrEqual(0);
    expect(edges.y1Bottom).toBeLessThanOrEqual(200);
  });

  it('金额极小的节点仍保留最小高度（不会消失）', () => {
    const input = flow(
      [node('big', 100000), node('tiny', 1)],
      [node('x', 100001)],
      [
        { source: 'big', target: 'x', value: 100000 },
        { source: 'tiny', target: 'x', value: 1 },
      ],
    );
    const { nodes } = sankeyLayout(input, 300, 200);
    const tiny = nodes.find((box) => box.id === 'tiny')!;
    expect(tiny.height).toBeGreaterThanOrEqual(3);
  });

  it('金额为 0 的 link 不产生缎带', () => {
    const input = flow(
      [node('a', 100)],
      [node('x', 100)],
      [
        { source: 'a', target: 'x', value: 100 },
        { source: 'a', target: 'x', value: 0 },
      ],
    );
    const { ribbons } = sankeyLayout(input, 300, 200);
    expect(ribbons).toHaveLength(1);
  });
});
