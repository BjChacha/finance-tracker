import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { projects, type Project } from '@/db/schema';
import { newId } from '@/lib/id';

/** 未归档项目，按 sortOrder → createdAt 排序 */
export async function listProjects(): Promise<Project[]> {
  return db
    .select()
    .from(projects)
    .where(eq(projects.archived, 0))
    .orderBy(asc(projects.sortOrder), asc(projects.createdAt));
}

export type ProjectInput = {
  name: string;
  icon: string;
  color: string;
};

export async function createProject(input: ProjectInput): Promise<string> {
  const now = Date.now();
  const id = newId();
  await db.insert(projects).values({
    id,
    name: input.name,
    icon: input.icon,
    color: input.color,
    sortOrder: now,
    archived: 0,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateProject(id: string, input: ProjectInput): Promise<void> {
  await db
    .update(projects)
    .set({ name: input.name, icon: input.icon, color: input.color, updatedAt: Date.now() })
    .where(eq(projects.id, id));
}

export async function archiveProject(id: string): Promise<void> {
  await db.update(projects).set({ archived: 1, updatedAt: Date.now() }).where(eq(projects.id, id));
}
