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

/** 目前 schemaVersion=4 */
export const backupUpgraders: Record<number, BackupUpgrader> = {
  // v1 → v2：引入多币种。transactions 增加 currency/exchange_rate/amount_base_cents/to_amount，
  // accounts 增加 rate_to_base。v1 备份全部为隐式 CNY（本位币），按此回填。
  1: (payload) => {
    const data = (payload as { data?: Record<string, unknown> }).data ?? {};
    const txs = Array.isArray(data.transactions) ? data.transactions : [];
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    return {
      ...payload,
      schemaVersion: 2,
      data: {
        ...data,
        accounts: accounts.map((a) => ({
          ...(a as Record<string, unknown>),
          rateToBase: 1_000_000,
        })),
        transactions: txs.map((t) => {
          const row = t as Record<string, unknown>;
          const amount = typeof row.amount === 'number' ? row.amount : 0;
          const isTransfer = row.type === 'transfer';
          return {
            ...row,
            currency: 'CNY',
            exchangeRate: 1_000_000,
            amountBaseCents: amount,
            toAmount: isTransfer ? amount : null,
          };
        }),
      },
    };
  },
  // v2 → v3：引入「项目」机制。新增 projects 表（旧备份为空），
  // transactions 增加可空 projectId（旧数据统一补 null）。
  2: (payload) => {
    const data = (payload as { data?: Record<string, unknown> }).data ?? {};
    const txs = Array.isArray(data.transactions) ? data.transactions : [];
    return {
      ...payload,
      schemaVersion: 3,
      data: {
        ...data,
        projects: [],
        transactions: txs.map((t) => ({
          ...(t as Record<string, unknown>),
          projectId: null,
        })),
      },
    };
  },
  // v3 -> v4: normalize persisted account type values.
  3: (payload) => {
    const data = (payload as { data?: Record<string, unknown> }).data ?? {};
    const accountRows = Array.isArray(data.accounts) ? data.accounts : [];
    return {
      ...payload,
      schemaVersion: 4,
      data: {
        ...data,
        accounts: accountRows.map((account) => {
          const row = account as Record<string, unknown>;
          return { ...row, type: normalizeAccountType(row.type) };
        }),
      },
    };
  },
};

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
import { normalizeAccountType } from '@/db/account-types';
