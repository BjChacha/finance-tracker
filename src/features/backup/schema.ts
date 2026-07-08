import { z } from 'zod';
import { BACKUP_FORMAT } from '@/db/backup-version';

/**
 * 备份文件 zod 校验（zod v4）。
 *
 * 行 schema 与 src/db/schema.ts 的列一一对应（camelCase，与导出时 drizzle
 * select 的形状一致）。z.object 默认剥离未知键，恢复插入时天然干净。
 */

const accountRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(['cash', 'bank', 'alipay', 'wechat', 'credit', 'other']),
  icon: z.string(),
  color: z.string(),
  initialBalance: z.int(),
  currency: z.string(),
  includeInTotal: z.int(),
  sortOrder: z.number(),
  archived: z.int(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const categoryRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(['expense', 'income']),
  icon: z.string(),
  color: z.string(),
  parentId: z.string().nullable(),
  sortOrder: z.number(),
  isPreset: z.int(),
  archived: z.int(),
});

const transactionRowSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['expense', 'income', 'transfer']),
  amount: z.int(),
  fee: z.int(),
  accountId: z.string().min(1),
  toAccountId: z.string().nullable(),
  categoryId: z.string().nullable(),
  date: z.number(),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string(),
  recurringRuleId: z.string().nullable(),
  importBatchId: z.string().nullable(),
  fingerprint: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const budgetRowSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().nullable(),
  amount: z.int(),
  alertPct: z.int(),
  enabled: z.int(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const recurringRuleRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(['expense', 'income', 'transfer']),
  amount: z.int(),
  accountId: z.string().min(1),
  toAccountId: z.string().nullable(),
  categoryId: z.string().nullable(),
  note: z.string(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.int(),
  anchor: z.int(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  nextRunDate: z.string(),
  lastRunDate: z.string().nullable(),
  autoCreate: z.int(),
  enabled: z.int(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const importBatchRowSchema = z.object({
  id: z.string().min(1),
  adapterId: z.string(),
  sourceName: z.string(),
  importedAt: z.number(),
  txCount: z.int(),
  skippedCount: z.int(),
});

const importMappingRowSchema = z.object({
  id: z.string().min(1),
  adapterId: z.string(),
  kind: z.enum(['category', 'account']),
  sourceLabel: z.string(),
  targetId: z.string(),
});

const settingRowSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

/** 备份文件完整 schema（当前版本 = BACKUP_SCHEMA_VERSION 的数据形状） */
export const backupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.int().positive(),
  appVersion: z.string(),
  exportedAt: z.string(),
  data: z.object({
    accounts: z.array(accountRowSchema),
    categories: z.array(categoryRowSchema),
    transactions: z.array(transactionRowSchema),
    budgets: z.array(budgetRowSchema),
    recurringRules: z.array(recurringRuleRowSchema),
    importBatches: z.array(importBatchRowSchema),
    importMappings: z.array(importMappingRowSchema),
    settings: z.array(settingRowSchema),
  }),
});

export type BackupFile = z.infer<typeof backupFileSchema>;
export type BackupData = BackupFile['data'];

/**
 * 信封 schema：只校验 format 与 schemaVersion。
 * 恢复时先用它判定文件类型与版本，再走升级链，最后用 backupFileSchema 全量校验
 * （旧版本数据形状可能与当前 schema 不同，不能一上来就全量校验）。
 */
export const backupEnvelopeSchema = z.looseObject({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.int().positive(),
});
