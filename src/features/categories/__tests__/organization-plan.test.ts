import type { Category } from '@/db/schema';
import { planCategoryOrganization } from '../organization-plan';

const category = (id: string, name: string, parentId: string | null = null): Category => ({
  id, name, parentId, type: 'expense', archived: 0, isPreset: 0, sortOrder: 0, icon: 'package', color: '#123456',
});
const rules = [{ target: 'Shopping', sources: ['Electronics', 'Clothing'] }];

it('preserves identities and is idempotent after applying the plan', () => {
  const rows = [category('shop', 'Shopping'), category('device', 'Electronics')];
  const moves = planCategoryOrganization(rows, rules, new Set());
  expect(moves).toEqual([{ id: 'device', name: 'Electronics', parentId: 'shop', parentName: 'Shopping' }]);
  const updated = rows.map((row) => ({ ...row, parentId: moves.find((move) => move.id === row.id)?.parentId ?? row.parentId }));
  expect(planCategoryOrganization(updated, rules, new Set())).toEqual([]);
  expect(rows[1].parentId).toBeNull();
});

it('does not change budget scope or create a third level', () => {
  const rows = [category('shop', 'Shopping'), category('device', 'Electronics'), category('clothes', 'Clothing'), category('child', 'Shoes', 'clothes')];
  expect(planCategoryOrganization(rows, rules, new Set(['device']))).toEqual([
    { id: 'clothes', name: 'Clothing', parentId: 'shop', parentName: 'Shopping' },
    { id: 'child', name: 'Shoes', parentId: 'shop', parentName: 'Shopping' },
  ]);
});

it('skips archived categories, ambiguous targets and sibling name collisions', () => {
  const rows = [category('shop', 'Shopping'), category('device', 'Electronics')];
  expect(planCategoryOrganization([...rows, category('other', 'Shopping')], rules, new Set())).toEqual([]);
  expect(planCategoryOrganization([...rows, category('child', 'Electronics', 'shop')], rules, new Set())).toEqual([]);
  expect(planCategoryOrganization([rows[0], { ...rows[1], archived: 1 }], rules, new Set())).toEqual([]);
});
