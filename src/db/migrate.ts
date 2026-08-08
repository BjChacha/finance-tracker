import type { MigrationMeta } from 'drizzle-orm/migrator';
import { db } from './client';
import migrations from './migrations/migrations';

/**
 * 在模块加载时【同步】完成数据库迁移。
 *
 * 为什么同步：drizzle 的 expo-sqlite 迁移底层本就是同步的——`SQLiteSyncDialect.migrate`
 * 全程用 `session.run/values`，无 await；drizzle 顶层那个 `async migrate()` 仅因多余的
 * `for await readMigrationFiles` 才是 async。这里同步复刻 readMigrationFiles 并直接调用
 * `db.dialect.migrate`，从而：
 *   - 不用 top-level await（本工具链下 TLA 会运行时报 "Property 'await' doesn't exist"）；
 *   - 迁移折进模块求值期（由 native 启动屏自然遮盖），React 首次挂载前 DB 已就绪——
 *     无需渲染阻塞门、无需启动屏 API、无查询竞态；桌面快捷方式→记账键盘可秒开。
 *
 * 仅由 app/_layout.tsx（运行时）引入，单元测试不导入它。
 */
function readMigrationMetas(): MigrationMeta[] {
  const map = migrations.migrations as Record<string, string | undefined>;
  const out: MigrationMeta[] = [];
  for (const entry of migrations.journal.entries) {
    const key = `m${String(entry.idx).padStart(4, '0')}`;
    const raw = map[key];
    if (raw === undefined) throw new Error(`Missing migration: ${entry.tag}`);
    out.push({
      sql: raw.split('--> statement-breakpoint'),
      folderMillis: entry.when,
      hash: '',
      bps: entry.breakpoints,
    });
  }
  return out;
}

// drizzle 未在公开类型里暴露 dialect/session（其 migrator 内部经鸭子类型取用），此处按内部结构取用。
const internal = db as unknown as {
  dialect: { migrate(migrations: MigrationMeta[], session: unknown): void };
  session: unknown;
};

let _migrationError: Error | null = null;
try {
  internal.dialect.migrate(readMigrationMetas(), internal.session); // 同步，无 await
} catch (e) {
  _migrationError = e instanceof Error ? e : new Error(String(e));
}
export const migrationError: Error | null = _migrationError;
