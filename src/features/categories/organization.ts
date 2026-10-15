import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { budgets, categories } from '@/db/schema';
import { buildBackupFile } from '@/features/backup/repository';
import { withBackupLock } from '@/features/backup/automatic';
import { saveLocalSnapshot } from '@/features/backup/storage';
import { planCategoryOrganization, type CategoryMove } from './organization-plan';
import { organizationRules } from './organization-rules';

export function previewCategoryOrganization(): CategoryMove[] {
  return db.transaction((tx) => planCategoryOrganization(tx.select().from(categories).all(), organizationRules,
    new Set(tx.select().from(budgets).all().flatMap((budget) => budget.categoryId ? [budget.categoryId] : []))));
}

export function organizeCategories(expected: CategoryMove[]): Promise<number> {
  return withBackupLock(async () => {
    const snapshot = await buildBackupFile();
    await saveLocalSnapshot(`safety-backup-${Date.now()}.json`, JSON.stringify(snapshot));
    return db.transaction((tx) => {
      const current = planCategoryOrganization(tx.select().from(categories).all(), organizationRules,
        new Set(tx.select().from(budgets).all().flatMap((budget) => budget.categoryId ? [budget.categoryId] : [])));
      if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('Categories changed. Preview the plan again.');
      for (const move of current) tx.update(categories).set({ parentId: move.parentId }).where(eq(categories.id, move.id)).run();
      return current.length;
    });
  });
}
