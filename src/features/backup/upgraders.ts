import { normalizeAccountType } from '@/db/account-types';
import {
  TRANSFER_CATEGORY_PRESETS,
  TRANSFER_OTHER_CATEGORY_ID,
} from '@/db/category-presets';

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

/** 目前 schemaVersion=11（升级函数最高到 10 → 11） */
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
  // v4 → v5：预算引入「周期」。budgets 增加 period，旧数据统一回填 'month'
  // （原实现仅月预算，语义不变）。索引重建由 DB migration 负责。
  4: (payload) => {
    const data = (payload as { data?: Record<string, unknown> }).data ?? {};
    const budgetRows = Array.isArray(data.budgets) ? data.budgets : [];
    return {
      ...payload,
      schemaVersion: 5,
      data: {
        ...data,
        budgets: budgetRows.map((b) => ({
          ...(b as Record<string, unknown>),
          period: 'month',
        })),
      },
    };
  },
  5: (payload) => {
    const data = (payload as { data?: Record<string, unknown> }).data ?? {};
    const categoryRows = Array.isArray(data.categories) ? data.categories : [];
    const transactionRows = Array.isArray(data.transactions) ? data.transactions : [];
    const recurringRuleRows = Array.isArray(data.recurringRules) ? data.recurringRules : [];
    const existingCategoryIds = new Set(
      categoryRows.map((category) => (category as Record<string, unknown>).id),
    );
    const missingTransferCategories = TRANSFER_CATEGORY_PRESETS.flatMap((preset, sortOrder) =>
      existingCategoryIds.has(preset.id)
        ? []
        : [
            {
              ...preset,
              type: 'transfer',
              parentId: null,
              sortOrder,
              isPreset: 1,
              archived: 0,
            },
          ],
    );
    const backfillTransferCategory = (value: unknown) => {
      const row = value as Record<string, unknown>;
      if (row.type !== 'transfer' || row.categoryId != null) return row;
      return { ...row, categoryId: TRANSFER_OTHER_CATEGORY_ID };
    };

    return {
      ...payload,
      schemaVersion: 6,
      data: {
        ...data,
        categories: [...categoryRows, ...missingTransferCategories],
        transactions: transactionRows.map(backfillTransferCategory),
        recurringRules: recurringRuleRows.map(backfillTransferCategory),
      },
    };
  },
  // v6 → v7：引入「个人资产」。新增 personal_assets / asset_valuations 表
  //（旧备份为空，恢复后由用户重新录入，不影响既有账目数据）。
  6: (payload) => {
    const data = (payload as { data?: Record<string, unknown> }).data ?? {};
    return {
      ...payload,
      schemaVersion: 7,
      data: {
        ...data,
        personalAssets: Array.isArray(data.personalAssets) ? data.personalAssets : [],
        assetValuations: Array.isArray(data.assetValuations) ? data.assetValuations : [],
      },
    };
  },
  // v7 → v8：个人资产增加出售收入关联列 sold_transaction_id，旧行统一补 null。
  7: (payload) => {
    const data = (payload as { data?: Record<string, unknown> }).data ?? {};
    const assetRows = Array.isArray(data.personalAssets) ? data.personalAssets : [];
    return {
      ...payload,
      schemaVersion: 8,
      data: {
        ...data,
        personalAssets: assetRows.map((row) => ({
          soldTransactionId: null,
          ...(row as Record<string, unknown>),
        })),
      },
    };
  },
  // v8 → v9：个人资产支持分期购买，旧资产一律按「非分期」回填。
  // v8 → v9：个人资产支持分期购买，旧资产一律按「非分期」回填。
  8: (payload) => {
    const data = (payload as { data?: Record<string, unknown> }).data ?? {};
    const assetRows = Array.isArray(data.personalAssets) ? data.personalAssets : [];
    return {
      ...payload,
      schemaVersion: 9,
      data: {
        ...data,
        personalAssets: assetRows.map((row) => ({
          installmentPeriods: 0,
          installmentDownPaymentCents: 0,
          installmentInterestCents: 0,
          installmentAnnualRateScaled: null,
          installmentFirstDueDateKey: null,
          installmentAccountId: null,
          installmentCategoryId: null,
          installmentRuleId: null,
          installmentAutoCreate: 1,
          installmentClosedDateKey: null,
          installmentDownPaymentTransactionId: null,
          ...(row as Record<string, unknown>),
        })),
      },
    };
  },
  // v9 → v10：个人资产移除估值（asset_valuations 数组与 current_value_cents 字段下线）。
  9: (payload) => {
    const data = (payload as { data?: Record<string, unknown> }).data ?? {};
    const { assetValuations: _droppedValuations, personalAssets: assetRows, ...rest } =
      data as { assetValuations?: unknown; personalAssets?: unknown };
    void _droppedValuations;
    const rows = Array.isArray(assetRows) ? assetRows : [];
    return {
      ...payload,
      schemaVersion: 10,
      data: {
        ...rest,
        personalAssets: rows.map((row) => {
          const { currentValueCents: _droppedValue, ...assetRow } = row as Record<string, unknown>;
          void _droppedValue;
          return assetRow;
        }),
      },
    };
  },
  // v10 → v11：引入自动分类规则与分类来源标记。
  // transactions 增加 categorySource（旧数据统一 'manual'）；新增 categorization_rules
  // 表（用户数据，旧备份为空数组）。insights 为派生数据不进备份，无需处理。
  10: (payload) => {
    const data = (payload as { data?: Record<string, unknown> }).data ?? {};
    const txs = Array.isArray(data.transactions) ? data.transactions : [];
    return {
      ...payload,
      schemaVersion: 11,
      data: {
        ...data,
        transactions: txs.map((t) => ({
          ...(t as Record<string, unknown>),
          categorySource: 'manual',
        })),
        categorizationRules: [],
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
