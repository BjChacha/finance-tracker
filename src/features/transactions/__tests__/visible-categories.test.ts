import { buildVisibleCategoryTree } from '../visible-categories';

type Node = { id: string; children: { id: string }[] };

function node(id: string, children: Node[] = []): Node {
  return { id, children };
}

/** c11/c12 挂在 p1 下;共 5 个顶级节点 */
const tree: Node[] = [
  node('p1', [node('c11'), node('c12')]),
  node('p2'),
  node('p3'),
  node('p4'),
  node('p5'),
];

describe('buildVisibleCategoryTree', () => {
  it('无选中时返回固定顺序前缀', () => {
    expect(buildVisibleCategoryTree(tree, 3, null).map((n) => n.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('选中分类在前缀内(父或子)时原样返回', () => {
    expect(buildVisibleCategoryTree(tree, 3, 'p2').map((n) => n.id)).toEqual(['p1', 'p2', 'p3']);
    expect(buildVisibleCategoryTree(tree, 3, 'c12').map((n) => n.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('选中前缀外的父分类时替换最后一项', () => {
    expect(buildVisibleCategoryTree(tree, 3, 'p5').map((n) => n.id)).toEqual(['p1', 'p2', 'p5']);
  });

  it('选中前缀外父分类下的子分类时,其父节点替换最后一项', () => {
    const far: Node[] = [node('p1'), node('p2'), node('p3'), node('p4', [node('c41')])];
    expect(buildVisibleCategoryTree(far, 3, 'c41').map((n) => n.id)).toEqual(['p1', 'p2', 'p4']);
  });

  it('选中项恰为前缀最后一项时不替换、顺序不变', () => {
    expect(buildVisibleCategoryTree(tree, 3, 'p3').map((n) => n.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('count 覆盖全树时原样返回,不触发替换', () => {
    expect(buildVisibleCategoryTree(tree, 5, 'p5').map((n) => n.id)).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
    ]);
    expect(buildVisibleCategoryTree(tree, 99, 'p5').length).toBe(5);
  });

  it('count 为 0 或负数时返回空数组', () => {
    expect(buildVisibleCategoryTree(tree, 0, 'p5')).toEqual([]);
    expect(buildVisibleCategoryTree(tree, -3, null)).toEqual([]);
  });

  it('categoryId 不在树中时返回前缀原样', () => {
    expect(buildVisibleCategoryTree(tree, 3, 'ghost').map((n) => n.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('替换时返回新数组,不修改原树', () => {
    const snapshot = tree.map((n) => n.id);
    buildVisibleCategoryTree(tree, 3, 'p5');
    expect(tree.map((n) => n.id)).toEqual(snapshot);
  });
});
