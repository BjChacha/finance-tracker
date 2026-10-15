import Constants from 'expo-constants';
import { asc, eq } from 'drizzle-orm';
import { alias, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import Papa from 'papaparse';
import { normalizeAccountType } from '@/db/account-types';
import { toCsvRecord } from './csv';
import { db } from '@/db/client';
import { BACKUP_FORMAT, BACKUP_SCHEMA_VERSION } from '@/db/backup-version';
import {
  accounts,
  budgets,
  categories,
  importBatches,
  importMappings,
  projects,
  recurringRules,
  settings,
  transactions,
} from '@/db/schema';
import { getSetting, setSetting } from '@/db/settings';
import { dayjs } from '@/lib/date';
import { readTextFromUri, shareFile, writeTextToCache } from '@/lib/fs';
import { saveLocalSnapshot } from './storage';
import { backupEnvelopeSchema, backupFileSchema, type BackupData, type BackupFile } from './schema';
import { runUpgradeChain, type RawBackupPayload } from './upgraders';

/* ---------------------------------- settings ---------------------------------- */

const LAST_BACKUP_AT_KEY = 'backup.lastBackupAt';

/** 上次备份时间（Unix 毫秒），从未备份返回 null */
export function getLastBackupAt(): Promise<number | null> {
  return getSetting<number>(LAST_BACKUP_AT_KEY);
}

/* ---------------------------------- 导出备份 ---------------------------------- */

/** 读取 9 张表全量数据，组装当前版本的备份对象 */
export async function buildBackupFile(): Promise<BackupFile> {
  const snapshot = db.transaction((tx) => ({
    accountRows: tx.select().from(accounts).all(),
    categoryRows: tx.select().from(categories).all(),
    projectRows: tx.select().from(projects).all(),
    transactionRows: tx.select().from(transactions).all(),
    budgetRows: tx.select().from(budgets).all(),
    recurringRuleRows: tx.select().from(recurringRules).all(),
    importBatchRows: tx.select().from(importBatches).all(),
    importMappingRows: tx.select().from(importMappings).all(),
    settingRows: tx.select().from(settings).all(),
  }));
  const { accountRows, categoryRows, projectRows, transactionRows, budgetRows,
    recurringRuleRows, importBatchRows, importMappingRows, settingRows } = snapshot;
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    exportedAt: new Date().toISOString(),
    data: {
      accounts: accountRows.map((account) => ({
        ...account,
        type: normalizeAccountType(account.type),
      })),
      categories: categoryRows,
      projects: projectRows,
      transactions: transactionRows,
      budgets: budgetRows,
      recurringRules: recurringRuleRows,
      importBatches: importBatchRows,
      importMappings: importMappingRows,
      settings: settingRows,
    },
  };
}

/** 导出 JSON 全量备份：写缓存 → 系统分享 → 记录上次备份时间 */
export async function exportBackup(): Promise<void> {
  const backup = await buildBackupFile();
  const filename = `finance-backup-${dayjs().format('YYYYMMDD-HHmmss')}.json`;
  const uri = await writeTextToCache(filename, JSON.stringify(backup));
  await shareFile(uri, 'application/json');
  await setSetting(LAST_BACKUP_AT_KEY, Date.now());
}

/* ---------------------------------- 恢复备份 ---------------------------------- */

/** 分批插入，避免超出 SQLite 绑定变量上限；每批 ≤ 200 行且参数数 ≤ 900 */
function insertInBatches<TTable extends SQLiteTable>(
  table: TTable,
  rows: TTable['$inferInsert'][],
): void {
  if (rows.length === 0) return;
  const columnCount = Math.max(1, Object.keys(rows[0] as Record<string, unknown>).length);
  const batchSize = Math.max(1, Math.min(200, Math.floor(900 / columnCount)));
  for (let i = 0; i < rows.length; i += batchSize) {
    db.insert(table).values(rows.slice(i, i + batchSize)).run();
  }
}

export type RestoreResult = {
  /** 恢复前自动留档的安全备份文件 uri */
  safetyBackupUri: string;
  /** 各表恢复行数 */
  counts: Record<keyof BackupData, number>;
};

/**
 * 从备份文件恢复全部数据（覆盖式）。
 *
 * 流程：读文件 → JSON 解析 → 信封校验（format/schemaVersion）→ 版本比对
 * （高版本拒绝 / 低版本走升级链）→ 全量 zod 校验 → 当前库自动留档安全备份 →
 * 事务内清空 8 表并分批重建插入。
 *
 * 调用方负责 UI 双重确认与恢复后的缓存全量失效。
 */
export async function restoreBackup(fileUri: string): Promise<RestoreResult> {
  const text = await readTextFromUri(fileUri);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON 备份');
  }

  const envelope = backupEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new Error('备份文件格式无效（缺少 format / schemaVersion 标识）');
  }

  let payload = envelope.data as RawBackupPayload;
  const version = payload.schemaVersion;
  if (version > BACKUP_SCHEMA_VERSION) {
    throw new Error('备份来自更高版本的 APP，请升级 APP 后再恢复');
  }
  if (version < BACKUP_SCHEMA_VERSION) {
    payload = runUpgradeChain(payload, version, BACKUP_SCHEMA_VERSION);
  }

  const parsed = backupFileSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const at = first ? `（${first.path.join('.')}: ${first.message}）` : '';
    throw new Error(`备份数据校验失败${at}`);
  }
  const data = parsed.data.data;

  // Keep the recovery snapshot outside the disposable cache directory.
  const safety = await buildBackupFile();
  const safetyBackupUri = await saveLocalSnapshot(
    `safety-backup-${Date.now()}.json`,
    JSON.stringify(safety),
  );

  db.transaction(() => {
    // 先删引用方，再删被引用方（transactions/budgets/recurring 引用 accounts/categories/projects）
    db.delete(transactions).run();
    db.delete(projects).run();
    db.delete(recurringRules).run();
    db.delete(budgets).run();
    db.delete(importBatches).run();
    db.delete(importMappings).run();
    db.delete(settings).run();
    db.delete(accounts).run();
    db.delete(categories).run();

    // 先插被引用方，再插引用方
    insertInBatches(accounts, data.accounts);
    insertInBatches(categories, data.categories);
    insertInBatches(projects, data.projects);
    insertInBatches(transactions, data.transactions);
    insertInBatches(budgets, data.budgets);
    insertInBatches(recurringRules, data.recurringRules);
    insertInBatches(importBatches, data.importBatches);
    insertInBatches(importMappings, data.importMappings);
    insertInBatches(settings, data.settings);
  });

  return {
    safetyBackupUri,
    counts: {
      accounts: data.accounts.length,
      categories: data.categories.length,
      projects: data.projects.length,
      transactions: data.transactions.length,
      budgets: data.budgets.length,
      recurringRules: data.recurringRules.length,
      importBatches: data.importBatches.length,
      importMappings: data.importMappings.length,
      settings: data.settings.length,
    },
  };
}

/* ---------------------------------- CSV 导出 ---------------------------------- */

/**
 * 导出全部交易明细为 CSV（中文表头，UTF-8 带 BOM，Excel 可直接打开）→ 系统分享。
 * @returns 导出的行数
 */
export async function exportCsv(): Promise<number> {
  const toAccounts = alias(accounts, 'to_accounts');
  const parentCategories = alias(categories, 'parent_categories');
  const rows = await db
    .select({
      dateKey: transactions.dateKey,
      type: transactions.type,
      amount: transactions.amount,
      fee: transactions.fee,
      note: transactions.note,
      categoryName: categories.name,
      categoryParentName: parentCategories.name,
      accountName: accounts.name,
      toAccountName: toAccounts.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(toAccounts, eq(transactions.toAccountId, toAccounts.id))
    .orderBy(asc(transactions.dateKey), asc(transactions.createdAt));

  const records = rows.map(toCsvRecord);
  if (records.length === 0) return 0;

  const csv = Papa.unparse(records, { newline: '\r\n' });
  // UTF-8 BOM 前缀（U+FEFF）：Excel 识别中文必需
  const content = '\uFEFF' + csv;
  const filename = `finance-transactions-${dayjs().format('YYYYMMDD-HHmmss')}.csv`;
  const uri = await writeTextToCache(filename, content);
  await shareFile(uri, 'text/csv');
  return records.length;
}
