import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

const sqlite = openDatabaseSync('finance.db', { enableChangeListener: false });
sqlite.execSync('PRAGMA journal_mode = WAL');
sqlite.execSync('PRAGMA foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { sqlite };

/** 在单个事务中执行（同步回调内的 drizzle 操作用 *Sync 变体或直接 SQL） */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  return db.transaction(async () => fn()) as Promise<T>;
}
