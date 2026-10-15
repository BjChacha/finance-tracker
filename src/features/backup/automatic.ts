import { z } from 'zod';
import { buildBackupFile } from './repository';
import { pruneExternalSnapshots, pruneLocalSnapshots, readLocalConfig, saveExternalSnapshot,
  saveLocalSnapshot, writeLocalConfig } from './storage';

const configSchema = z.object({
  enabled: z.boolean().default(false),
  directory: z.string().nullable().default(null),
  lastSuccessAt: z.number().nullable().default(null),
  lastError: z.string().nullable().default(null),
});
export type AutoBackupConfig = z.infer<typeof configSchema>;

let operation: Promise<unknown> = Promise.resolve();
export function withBackupLock<T>(work: () => Promise<T>): Promise<T> {
  const next = operation.then(work, work);
  operation = next.catch(() => {});
  return next;
}

export async function getAutoBackupConfig(): Promise<AutoBackupConfig> {
  return configSchema.parse((await readLocalConfig()) ?? {});
}

export function configureAutoBackup(update: Partial<Pick<AutoBackupConfig, 'enabled' | 'directory'>>): Promise<void> {
  return withBackupLock(async () => {
    const current = await getAutoBackupConfig();
    await writeLocalConfig({ ...current, ...update,
      lastSuccessAt: update.directory !== undefined && update.directory !== current.directory ? null : current.lastSuccessAt,
      lastError: null });
  });
}

export function isBackupDue(lastSuccessAt: number | null, now: number): boolean {
  if (!lastSuccessAt || lastSuccessAt > now) return true;
  return new Date(lastSuccessAt).toDateString() !== new Date(now).toDateString();
}

export function runAutoBackup(force = false): Promise<boolean> {
  return withBackupLock(async () => {
    const config = await getAutoBackupConfig();
    if (!force && (!config.enabled || !isBackupDue(config.lastSuccessAt, Date.now()))) return false;
    try {
      const content = JSON.stringify(await buildBackupFile());
      const timestamp = Date.now();
      const name = `auto-backup-${timestamp}.json`;
      await saveLocalSnapshot(name, content);
      if (config.directory) await saveExternalSnapshot(config.directory, name, content);
      await writeLocalConfig({ ...config, lastSuccessAt: timestamp, lastError: null });
      // Old copies are only removed after the new copy is verified at every destination.
      await pruneLocalSnapshots();
      if (config.directory) await pruneExternalSnapshots(config.directory);
      return true;
    } catch (error) {
      const latest = await getAutoBackupConfig();
      await writeLocalConfig({ ...latest, lastError: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });
}
