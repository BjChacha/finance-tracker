type MigrationBundle = {
  journal: { entries: Array<{ idx: number; tag: string }> };
  migrations: Record<string, string>;
};

const migrationBundle = require('../migrations/migrations').default as MigrationBundle;

describe('migrations', () => {
  it('registers transfer categories as the latest migration', () => {
    expect(migrationBundle.journal.entries.at(-1)).toMatchObject({
      idx: 6,
      tag: '0006_transfer_categories',
    });
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
