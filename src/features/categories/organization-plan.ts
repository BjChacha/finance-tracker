import type { Category } from '@/db/schema';

export type CategoryMove = { id: string; name: string; parentId: string; parentName: string };
export type OrganizationRule = { target: string; sources: string[] };

export function planCategoryOrganization(categories: Category[], rules: OrganizationRule[], budgetIds: Set<string>): CategoryMove[] {
  const roots = categories.filter((category) => category.type === 'expense' && !category.archived && category.parentId === null);
  const moves: CategoryMove[] = [];
  for (const rule of rules) {
    const targets = roots.filter((category) => category.name === rule.target);
    if (targets.length !== 1) continue;
    const target = targets[0];
    for (const source of roots.filter((category) => rule.sources.includes(category.name))) {
      // Preserve source budgets and flatten a moved branch to keep exactly two levels.
      if (source.id === target.id || budgetIds.has(source.id)) continue;
      const children = categories.filter((category) => category.parentId === source.id);
      const branch = [source, ...children];
      if (children.some((child) => budgetIds.has(child.id) || categories.some((node) => node.parentId === child.id))) continue;
      if (branch.some((member) => categories.some((node) => node.parentId === target.id && node.name === member.name && !node.archived))) continue;
      if (categories.some((category) => category.parentId === target.id && category.name === source.name && !category.archived)) continue;
      for (const member of branch) moves.push({ id: member.id, name: member.name, parentId: target.id, parentName: target.name });
    }
  }
  return moves;
}
