import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { AccountType } from './account-types';

export type { AccountType } from './account-types';
/** 交易类型 */
export type TransactionType = 'expense' | 'income' | 'transfer';
/** 周期频率 */
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').$type<AccountType>().notNull(),
  icon: text('icon').notNull(),
  color: text('color').notNull(),
  /** 初始余额（分），信用卡可为负 */
  initialBalance: integer('initial_balance').notNull().default(0),
  currency: text('currency').notNull().default('CNY'),
  /** 相对本位币的当前汇率 ×1e6（RATE_SCALE），用于净值换算；本位币账户=1000000 */
  rateToBase: integer('rate_to_base').notNull().default(1000000),
  includeInTotal: integer('include_in_total').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: integer('archived').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').$type<'expense' | 'income'>().notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    parentId: text('parent_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    isPreset: integer('is_preset').notNull().default(0),
    archived: integer('archived').notNull().default(0),
  },
  (t) => [index('idx_categories_type').on(t.type, t.archived, t.sortOrder)],
);

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    archived: integer('archived').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('idx_projects_list').on(t.archived, t.sortOrder)],
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    type: text('type').$type<TransactionType>().notNull(),
    /** 金额（分），恒为正数，方向由 type 决定；为交易币种 currency 下的金额 */
    amount: integer('amount').notNull(),
    /** 交易币种（ISO 4217），与账户币种一致 */
    currency: text('currency').notNull().default('CNY'),
    /** 相对本位币汇率 ×1e6（RATE_SCALE=1_000_000）；本位币交易=1000000 */
    exchangeRate: integer('exchange_rate').notNull().default(1000000),
    /** 本位币金额（分）= round(amount × exchangeRate / 1e6)；跨账户统计/预算聚合用 */
    amountBaseCents: integer('amount_base_cents').notNull().default(0),
    /** 转账手续费（分，交易币种），计入支出统计 */
    fee: integer('fee').notNull().default(0),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    /** 仅 transfer：转入账户 */
    toAccountId: text('to_account_id').references(() => accounts.id),
    /** 仅 transfer：转入侧金额（目标账户币种，分）；同币种=amount，跨币种=按汇率换算 */
    toAmount: integer('to_amount'),
    /** transfer 为空 */
    categoryId: text('category_id').references(() => categories.id),
    /** 可选：所属项目 */
    projectId: text('project_id').references(() => projects.id),
    /** Unix 毫秒，精确排序 */
    date: integer('date').notNull(),
    /** 'YYYY-MM-DD'，写入时按本地时区固化，图表分组稳定 */
    dateKey: text('date_key').notNull(),
    note: text('note').notNull().default(''),
    recurringRuleId: text('recurring_rule_id'),
    importBatchId: text('import_batch_id'),
    /** SHA-256(dateKey|amount|type|note)，导入去重 */
    fingerprint: text('fingerprint'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('idx_tx_date').on(t.dateKey),
    index('idx_tx_account').on(t.accountId, t.dateKey),
    index('idx_tx_to_account').on(t.toAccountId, t.dateKey),
    index('idx_tx_category').on(t.categoryId, t.dateKey),
    index('idx_tx_project').on(t.projectId, t.dateKey),
    index('idx_tx_fingerprint').on(t.fingerprint),
    index('idx_tx_batch').on(t.importBatchId),
  ],
);

export const budgets = sqliteTable(
  'budgets',
  {
    id: text('id').primaryKey(),
    /** NULL = 月度总预算 */
    categoryId: text('category_id').references(() => categories.id),
    /** 每月额度（分） */
    amount: integer('amount').notNull(),
    /** 提醒阈值（%），100 时仅超支提醒 */
    alertPct: integer('alert_pct').notNull().default(80),
    enabled: integer('enabled').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('uq_budgets_category').on(t.categoryId)],
);

export const recurringRules = sqliteTable(
  'recurring_rules',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').$type<TransactionType>().notNull(),
    amount: integer('amount').notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    toAccountId: text('to_account_id').references(() => accounts.id),
    categoryId: text('category_id').references(() => categories.id),
    note: text('note').notNull().default(''),
    frequency: text('frequency').$type<RecurringFrequency>().notNull(),
    /** 每 N 个周期 */
    interval: integer('interval').notNull().default(1),
    /** 锚点：weekly=星期几(1-7,周一=1)，monthly=几号(1-31,31 含月末对齐)，yearly=MMDD，daily 忽略 */
    anchor: integer('anchor').notNull().default(1),
    startDate: text('start_date').notNull(),
    endDate: text('end_date'),
    nextRunDate: text('next_run_date').notNull(),
    lastRunDate: text('last_run_date'),
    /** 1=自动入账 0=仅提醒待确认 */
    autoCreate: integer('auto_create').notNull().default(1),
    enabled: integer('enabled').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('idx_recurring_next').on(t.enabled, t.nextRunDate)],
);

export const importBatches = sqliteTable('import_batches', {
  id: text('id').primaryKey(),
  adapterId: text('adapter_id').notNull(),
  sourceName: text('source_name').notNull(),
  importedAt: integer('imported_at').notNull(),
  txCount: integer('tx_count').notNull(),
  skippedCount: integer('skipped_count').notNull().default(0),
});

export const importMappings = sqliteTable(
  'import_mappings',
  {
    id: text('id').primaryKey(),
    adapterId: text('adapter_id').notNull(),
    kind: text('kind').$type<'category' | 'account'>().notNull(),
    sourceLabel: text('source_label').notNull(),
    targetId: text('target_id').notNull(),
  },
  (t) => [uniqueIndex('uq_import_mappings').on(t.adapterId, t.kind, t.sourceLabel)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  /** JSON 字符串 */
  value: text('value').notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
export type RecurringRule = typeof recurringRules.$inferSelect;
export type NewRecurringRule = typeof recurringRules.$inferInsert;
export type ImportBatch = typeof importBatches.$inferSelect;
export type ImportMapping = typeof importMappings.$inferSelect;
