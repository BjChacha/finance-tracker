/**
 * Fixed-order visible category bar derivation.
 *
 * The category bar keeps the stored sort order (never reorders by suggestion
 * scores); when the selected category lives outside the visible prefix, its
 * top-level node takes over the last slot so the current selection is always
 * visible and can be swapped from there.
 */

type NodeLike = { id: string; children: { id: string }[] };

export function buildVisibleCategoryTree<T extends NodeLike>(
  tree: T[],
  count: number,
  categoryId: string | null,
): T[] {
  const prefix = tree.slice(0, Math.max(0, count));
  if (!categoryId || prefix.length === 0) return prefix;

  const owner = tree.find(
    (node) => node.id === categoryId || node.children.some((child) => child.id === categoryId),
  );
  if (!owner || prefix.some((node) => node.id === owner.id)) return prefix;
  return [...prefix.slice(0, -1), owner];
}
