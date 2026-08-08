/**
 * JSON 全量备份的 schema 版本号。
 *
 * 与 drizzle 迁移演进对应：每次数据库 schema 变更影响到备份数据形状时，
 * 此版本号 +1，并在 src/features/backup/upgraders.ts 中补一个
 * `旧版本号 → 旧版本号+1` 的升级函数，使旧备份文件仍可恢复。
 */
export const BACKUP_SCHEMA_VERSION = 4;

/** 备份文件的 format 标识，恢复时用于快速识别文件类型 */
export const BACKUP_FORMAT = 'finance-tracker-backup';
