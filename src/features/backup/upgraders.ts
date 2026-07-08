/**
 * 备份版本升级链。
 *
 * 约定：`backupUpgraders[N]` 负责把 schemaVersion=N 的备份数据升级为 N+1。
 * 恢复低版本备份时从其 schemaVersion 逐级调用，直到 BACKUP_SCHEMA_VERSION。
 *
 * 每次 BACKUP_SCHEMA_VERSION +1 时在此补一个升级函数，例如：
 *
 * ```ts
 * export const backupUpgraders: Record<number, BackupUpgrader> = {
 *   // v1 → v2：transactions 增加 tags 列，旧数据补默认值
 *   1: (payload) => ({
 *     ...payload,
 *     schemaVersion: 2,
 *     data: {
 *       ...payload.data,
 *       transactions: payload.data.transactions.map((t) => ({ ...t, tags: '' })),
 *     },
 *   }),
 * };
 * ```
 *
 * 升级函数只做纯数据变换（不访问数据库、不产生副作用），保证可单测。
 */

/** 升级函数输入/输出都是"未校验的备份文件对象"，形状由各版本自己约定 */
export type RawBackupPayload = {
  format: string;
  schemaVersion: number;
  // 其余字段（appVersion/exportedAt/data...）由各版本的形状决定
  [key: string]: unknown;
};

export type BackupUpgrader = (payload: RawBackupPayload) => RawBackupPayload;

/** 目前 schemaVersion=1，尚无历史版本需要升级 */
export const backupUpgraders: Record<number, BackupUpgrader> = {};

/**
 * 逐级执行升级链：fromVersion → fromVersion+1 → … → toVersion。
 * 纯函数；缺失某级 upgrader 时抛错（说明升级链没有维护完整）。
 */
export function runUpgradeChain(
  payload: RawBackupPayload,
  fromVersion: number,
  toVersion: number,
  upgraders: Record<number, BackupUpgrader> = backupUpgraders,
): RawBackupPayload {
  let current = payload;
  for (let v = fromVersion; v < toVersion; v++) {
    const upgrade = upgraders[v];
    if (!upgrade) {
      throw new Error(`缺少备份升级函数：v${v} → v${v + 1}`);
    }
    current = upgrade(current);
  }
  return current;
}
