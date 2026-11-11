import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { AccountType } from './account-types';
import type { BudgetPeriod } from '@/lib/date';

export type { AccountType } from './account-types';
/** 交易类型 */
export type TransactionType = 'expense' | 'income' | 'transfer';
export type CategoryType = TransactionType;
/** 分类归属来源：manual 手选 / rule 规则 / suggestion 统计建议 / nl 一句话识别 / import 导入 */
export type CategorySource = 'manual' | 'rule' | 'suggestion' | 'nl' | 'import';
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
    type: text('type').$type<CategoryType>().notNull(),
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
    /** 客户端幂等键（如快捷记账 handoffId）：同键重复提交返回既有记录，防双触发双写 */
    clientTag: text('client_tag'),
    /**
     * 分类归属来源：manual / rule / suggestion / nl / import。
     * 仅用于命中率统计与展示，不参与业务逻辑。
     */
    categorySource: text('category_source')
      .$type<CategorySource>()
      .notNull()
      .default('manual'),
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
    uniqueIndex('uq_tx_client_tag').on(t.clientTag),
  ],
);

export const budgets = sqliteTable(
  'budgets',
  {
    id: text('id').primaryKey(),
    /** 预算周期：month / quarter / year */
    period: text('period').$type<BudgetPeriod>().notNull().default('month'),
    /** NULL = 该周期的总预算；非空 = 该周期某分类预算（一级支出分类） */
    categoryId: text('category_id').references(() => categories.id),
    /** 该周期额度（分） */
    amount: integer('amount').notNull(),
    /** 提醒阈值（%），100 时仅超支提醒 */
    alertPct: integer('alert_pct').notNull().default(80),
    enabled: integer('enabled').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('uq_budgets_period_category').on(t.period, t.categoryId)],
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

/** One remote inference call. Cost is snapshotted so later price changes never rewrite history. */
export const llmUsage = sqliteTable(
  'llm_usage',
  {
    id: text('id').primaryKey(),
    /** Unix ms of the response */
    createdAt: integer('created_at').notNull(),
    model: text('model').notNull(),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    /** Input tokens billed at the cache-hit rate */
    cacheHitTokens: integer('cache_hit_tokens').notNull().default(0),
    /** Input tokens billed at the cache-miss rate */
    cacheMissTokens: integer('cache_miss_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    /** Cost in 1e-6 CNY (micro-yuan); 1 token at 1 CNY/1M tokens = 1 */
    costMicros: integer('cost_micros').notNull().default(0),
    /** Which published price tier applied when the call was billed */
    priceTier: text('price_tier').$type<'peak' | 'off_peak'>().notNull(),
  },
  (t) => [index('idx_llm_usage_created').on(t.createdAt)],
);

/**
 * One persisted period report. `snapshot` is the redacted aggregate the analysis was derived from,
 * stored so a report can be re-read offline without recomputing or re-billing the model.
 */
export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    period: text('period').$type<BudgetPeriod>().notNull(),
    /** 'YYYY-MM' | 'YYYY-Qn' | 'YYYY' */
    periodKey: text('period_key').notNull(),
    /** JSON ReportSnapshot; never contains notes, account names or exact dates */
    snapshot: text('snapshot').notNull(),
    /** JSON ReportAnalysis returned by the model */
    analysis: text('analysis').notNull(),
    /**
     * Contract version of `analysis`. Older rows are treated as missing so the scheduler
     * regenerates them instead of rendering a payload the UI no longer understands.
     */
    analysisVersion: integer('analysis_version').notNull().default(1),
    model: text('model').notNull(),
    /** Cost of the generating call in micro-yuan, snapshotted like llm_usage */
    costMicros: integer('cost_micros').notNull().default(0),
    generatedAt: integer('generated_at').notNull(),
  },
  (t) => [uniqueIndex('uq_reports_period_key').on(t.period, t.periodKey)],
);

/**
 * 个人资产（实物/虚拟物品的全生命周期台账）状态：
 * - holding 持有中
 * - sold 已出售（记录 soldCents 与 closedDateKey）
 * - disposed 已处置（送人/丢弃/报废，仅记录 closedDateKey）
 */
export type AssetStatus = 'holding' | 'sold' | 'disposed';

export const personalAssets = sqliteTable(
  'personal_assets',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** 类别 key（src/features/personal-assets/meta.ts 预设，存 key） */
    category: text('category').notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    /** 数量（件），成本为该数量的总额 */
    quantity: integer('quantity').notNull().default(1),
    /** 取得成本（本位币分，总额）；资产台账只记录成本，不做估值 */
    costCents: integer('cost_cents').notNull(),
    status: text('status').$type<AssetStatus>().notNull().default('holding'),
    /** 取得日期 'YYYY-MM-DD' */
    acquiredDateKey: text('acquired_date_key').notNull(),
    /** 出售/处置日期 'YYYY-MM-DD'；持有中为 NULL */
    closedDateKey: text('closed_date_key'),
    /** 出售所得（本位币分），仅 sold */
    soldCents: integer('sold_cents'),
    /**
     * 出售对应的收入交易 id：
     * - 手动出售勾选自动记账时 = 自动生成的收入交易；
     * - 关联出售时 = 用户选择的既有收入交易。
     * 不建外键：交易可被独立删除，资产作为历史台账应保留。
     */
    soldTransactionId: text('sold_transaction_id'),
    note: text('note').notNull().default(''),
    /**
     * 来源支出交易 id（从交易详情「生成资产」回填）。
     * 不建外键：交易可被独立删除，资产作为历史台账应保留。
     */
    sourceTransactionId: text('source_transaction_id'),

    /* ------------------------------ 分期购买 ------------------------------ */
    /** 分期期数；0 = 非分期资产（以下字段仅在分期时有效） */
    installmentPeriods: integer('installment_periods').notNull().default(0),
    /** 首付（本位币分） */
    installmentDownPaymentCents: integer('installment_down_payment_cents').notNull().default(0),
    /** 实际总利息（本位币分；两种利息输入模式结算后的值） */
    installmentInterestCents: integer('installment_interest_cents').notNull().default(0),
    /** 年化利率 × 100（12.5% → 1250）；NULL = 按总利息金额输入 */
    installmentAnnualRateScaled: integer('installment_annual_rate_scaled'),
    /** 首期还款日 'YYYY-MM-DD' */
    installmentFirstDueDateKey: text('installment_first_due_date_key'),
    /** 还款账户 id */
    installmentAccountId: text('installment_account_id'),
    /** 期次支出分类 id */
    installmentCategoryId: text('installment_category_id'),
    /** 关联周期记账规则 id（期次交易的生成引擎） */
    installmentRuleId: text('installment_rule_id'),
    /** 1=自动入账 0=待确认 */
    installmentAutoCreate: integer('installment_auto_create').notNull().default(1),
    /** 提前结清日期；NULL = 还款中 */
    installmentClosedDateKey: text('installment_closed_date_key'),
    /** 首付交易 id（详情可跳转查看） */
    installmentDownPaymentTransactionId: text('installment_down_payment_transaction_id'),

    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('idx_personal_assets_list').on(t.status, t.acquiredDateKey),
    index('idx_personal_assets_source_tx').on(t.sourceTransactionId),
    index('idx_personal_assets_installment_rule').on(t.installmentRuleId),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type PersonalAsset = typeof personalAssets.$inferSelect;
export type NewPersonalAsset = typeof personalAssets.$inferInsert;
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
/** 洞察状态：active 展示中 / acknowledged 用户已「知道了」 */
export type InsightStatus = 'active' | 'acknowledged';
/** 洞察类型（本地规则生成，见 src/features/insights/generators.ts） */
export type InsightType =
  | 'budget_risk'
  | 'spending_anomaly'
  | 'subscription_audit'
  | 'savings_rate_change'
  | 'upcoming_recurring';

/**
 * 本地规则洞察（派生数据，不进备份）：由 InsightRunner 在启动/回前台时本地计算，
 * 生成中文模板正文 + 具体数字，零 LLM 成本。dedupKey = `${type}:${periodKey}:${refId}`
 * 每键一行；acknowledged 后仅当档位/数值桶发生实质变化才复活为新洞察。
 */
export const insights = sqliteTable(
  'insights',
  {
    id: text('id').primaryKey(),
    type: text('type').$type<InsightType>().notNull(),
    dedupKey: text('dedup_key').notNull(),
    /** 归属月 'YYYY-MM'（洞察按月粒度生成与去重） */
    periodKey: text('period_key').notNull(),
    title: text('title').notNull(),
    /** 一行正文：模板 + 已格式化金额 */
    body: text('body').notNull(),
    /** 数值快照 JSON（tier/金额桶等），用于 acknowledged 行的复活判定 */
    dataJson: text('data_json').notNull().default('{}'),
    /** 点卡片跳转的路由（如 '/budgets'）；null 不跳 */
    actionRoute: text('action_route'),
    status: text('status').$type<InsightStatus>().notNull().default('active'),
    generatedAt: integer('generated_at').notNull(),
    acknowledgedAt: integer('acknowledged_at'),
  },
  (t) => [uniqueIndex('uq_insights_dedup').on(t.dedupKey)],
);

/**
 * 自动分类规则：备注含关键词（忽略大小写）且可选条件（类型/金额区间）匹配时
 * 设指定分类。确定性、离线、可解释，优先级高于统计建议（suggestions）。
 * 按 position 顺序取首条命中；只在新建交易表单里自动预填（用户可见可改），
 * 不静默改历史数据。
 */
export const categorizationRules = sqliteTable(
  'categorization_rules',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    enabled: integer('enabled').notNull().default(1),
    position: integer('position').notNull().default(0),
    keyword: text('keyword').notNull(),
    /** 仅匹配该交易类型；null=不限 */
    matchType: text('match_type').$type<TransactionType>(),
    /** 交易币种金额区间（分，含边界）；null=不限 */
    amountMin: integer('amount_min'),
    amountMax: integer('amount_max'),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    matchCount: integer('match_count').notNull().default(0),
    lastMatchedAt: integer('last_matched_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('idx_rules_order').on(t.enabled, t.position)],
);

export type Insight = typeof insights.$inferSelect;
export type NewInsight = typeof insights.$inferInsert;
export type CategorizationRule = typeof categorizationRules.$inferSelect;
export type NewCategorizationRule = typeof categorizationRules.$inferInsert;
export type ImportBatch = typeof importBatches.$inferSelect;
export type ImportMapping = typeof importMappings.$inferSelect;
export type LLMUsage = typeof llmUsage.$inferSelect;
export type NewLLMUsage = typeof llmUsage.$inferInsert;
export type ReportRow = typeof reports.$inferSelect;
export type NewReportRow = typeof reports.$inferInsert;
