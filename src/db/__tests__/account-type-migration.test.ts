type MigrationBundle = {
  journal: { entries: Array<{ idx: number; tag: string }> };
  migrations: Record<string, string>;
};

const migrationBundle = require('../migrations/migrations').default as MigrationBundle;

describe('migrations', () => {
  it('registers the analysis-version migration as the latest one', () => {
    expect(migrationBundle.journal.entries.at(-1)).toMatchObject({
      idx: 9,
      tag: '0009_spooky_reaper',
    });
    expect(migrationBundle.migrations.m0009).toEqual(expect.any(String));
    expect(migrationBundle.migrations.m0009.length).toBeGreaterThan(0);
  });

  it('0009 adds the report analysis contract version', () => {
    const sql = migrationBundle.migrations.m0009;
    expect(sql).toContain('ALTER TABLE `reports` ADD `analysis_version`');
    expect(sql).toContain('DEFAULT 1 NOT NULL');
  });

  it('0008 creates the reports table keyed by period', () => {
    const sql = migrationBundle.migrations.m0008;
    expect(sql).toContain('CREATE TABLE `reports`');
    expect(sql).toContain('`period_key` text NOT NULL');
    expect(sql).toContain('`snapshot` text NOT NULL');
    expect(sql).toContain('`analysis` text NOT NULL');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX `uq_reports_period_key` ON `reports` (`period`,`period_key`)',
    );
  });

  it('keeps the llm usage table registered', () => {
    expect(migrationBundle.migrations.m0007).toEqual(expect.any(String));
    expect(migrationBundle.migrations.m0007.length).toBeGreaterThan(0);
  });

  it('0007 creates the llm usage table with its time index', () => {
    const sql = migrationBundle.migrations.m0007;
    expect(sql).toContain('CREATE TABLE `llm_usage`');
    expect(sql).toContain('`cost_micros` integer DEFAULT 0 NOT NULL');
    expect(sql).toContain('CREATE INDEX `idx_llm_usage_created`');
  });

  it('keeps the transfer category migration registered', () => {
    expect(migrationBundle.migrations.m0006).toEqual(expect.any(String));
    expect(migrationBundle.migrations.m0006.length).toBeGreaterThan(0);
  });

  it('0006 inserts stable transfer presets and backfills both transfer sources', () => {
    const sql = migrationBundle.migrations.m0006;
    expect(sql).toContain("'preset-transfer-account'");
    expect(sql).toContain("'preset-transfer-bill-repayment'");
    expect(sql).toContain("'preset-transfer-withdrawal'");
    expect(sql).toContain("'preset-transfer-deposit'");
    expect(sql).toContain("'preset-transfer-other'");
    expect(sql).toContain('INSERT OR IGNORE INTO `categories`');
    expect(sql).toContain('UPDATE `transactions`');
    expect(sql).toContain('UPDATE `recurring_rules`');
    expect(sql.match(/SET `category_id` = 'preset-transfer-other'/g)).toHaveLength(2);
  });

  it('keeps the client tag migration registered', () => {
    expect(migrationBundle.migrations.m0005).toEqual(expect.any(String));
    expect(migrationBundle.migrations.m0005.length).toBeGreaterThan(0);
  });

  it('0005 adds the idempotency client_tag column with a unique index only', () => {
    const sql = migrationBundle.migrations.m0005;
    expect(sql).toContain('ADD `client_tag`');
    expect(sql).toContain('CREATE UNIQUE INDEX `uq_tx_client_tag`');
    // It must not re-run statements already shipped in earlier migrations (the generated
    // diff can duplicate them when intermediate snapshots are missing).
    expect(sql).not.toContain('CREATE TABLE');
    expect(sql).not.toContain('DROP INDEX');
    expect(sql).not.toContain('ADD `period`');
    expect(sql).not.toContain('ADD `project_id`');
  });

  it('0004 adds the period column and rebuilds the budgets unique index', () => {
    const sql = migrationBundle.migrations.m0004;
    expect(sql).toContain('ADD `period`');
    expect(sql).toContain('DROP INDEX `uq_budgets_category`');
    expect(sql).toContain('CREATE UNIQUE INDEX `uq_budgets_period_category`');
  });

  it('0003 preserves current account types and maps legacy/unknown safely', () => {
    const sql = migrationBundle.migrations.m0003;
    expect(sql).toContain("WHEN `type` = 'digital_wallet' THEN 'digital_wallet'");
    expect(sql).toContain("WHEN `type` = 'stored_value_card' THEN 'stored_value_card'");
    expect(sql).toContain("WHEN `type` = 'credit' THEN 'credit_card'");
    expect(sql).toContain("ELSE 'other'");
  });
});
