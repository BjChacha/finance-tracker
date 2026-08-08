import { eq } from 'drizzle-orm';
import { db, sqlite } from '@/db/client';
import { settings } from '@/db/schema';

/* --------------------------------- 读写工具 --------------------------------- */
// 统一的 settings 读写层；原先在 backup/repository.ts 与 suggestions/repository.ts
// 各复制了一份（后者已留 TODO 要统一）。所有 value 都以 JSON 字符串存入。

/** 异步读取一个设置项（JSON 反序列化）；键不存在或解析失败返回 null */
export async function getSetting<T>(key: string): Promise<T | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  const raw = rows[0]?.value;
  if (raw === undefined) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 异步写入一个设置项（JSON 序列化，主键冲突时覆盖） */
export async function setSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } });
}

/**
 * 同步读取一个设置项（JSON 反序列化），用于冷启动等不能 await 的场景。
 * 直接走原始 sqlite.getAllSync；表尚未建（首次安装未迁移）或解析失败时返回 fallback。
 */
export function getSettingSync<T>(key: string, fallback: T): T;
export function getSettingSync<T>(key: string): T | null;
export function getSettingSync<T>(key: string, fallback?: T): T | null {
  try {
    const rows = sqlite.getAllSync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [key],
    );
    const raw = rows[0]?.value;
    if (raw === undefined) return fallback ?? null;
    return JSON.parse(raw) as T;
  } catch {
    return fallback ?? null;
  }
}
