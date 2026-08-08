type MigrationBundle = {
  journal: { entries: Array<{ idx: number; tag: string }> };
  migrations: Record<string, string>;
};

const migrationBundle = require('../migrations/migrations').default as MigrationBundle;

describe('account type migration', () => {
  it('registers migration 0003 as the latest migration', () => {
    expect(migrationBundle.journal.entries.at(-1)).toMatchObject({
      idx: 3,
      tag: '0003_account_types',
    });
    expect(migrationBundle.migrations.m0003).toEqual(expect.any(String));
    expect(migrationBundle.migrations.m0003.length).toBeGreaterThan(0);
  });

  it('preserves current values and maps legacy or unknown values safely', () => {
    const sql = migrationBundle.migrations.m0003;
    expect(sql).toContain("WHEN `type` = 'digital_wallet' THEN 'digital_wallet'");
    expect(sql).toContain("WHEN `type` = 'stored_value_card' THEN 'stored_value_card'");
    expect(sql).toContain("WHEN `type` = 'credit' THEN 'credit_card'");
    expect(sql).toContain("ELSE 'other'");
  });
});
