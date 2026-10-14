import { ACCOUNT_TYPES } from '@/db/account-types';
import { backupEnvelopeSchema, backupFileSchema } from '../schema';

/** 合法的最小备份 fixture（每表 1 行或空） */
function validBackup() {
  return {
    format: 'finance-tracker-backup',
    schemaVersion: 6,
    appVersion: '1.0.0',
    exportedAt: '2026-07-08T10:00:00.000Z',
    data: {
      accounts: [
        {
          id: 'acc-1',
          name: '现金',
          type: 'cash',
          icon: '💵',
          color: '#10B981',
          initialBalance: 10000,
          currency: 'CNY',
          rateToBase: 1_000_000,
          includeInTotal: 1,
          sortOrder: 0,
          archived: 0,
          createdAt: 1751900000000,
          updatedAt: 1751900000000,
        },
      ],
      categories: [
        {
          id: 'cat-1',
          name: '餐饮',
          type: 'expense',
          icon: '🍜',
          color: '#F97316',
          parentId: null,
          sortOrder: 0,
          isPreset: 1,
          archived: 0,
        },
      ],
      projects: [],
      transactions: [
        {
          id: 'tx-1',
          type: 'expense',
          amount: 1250,
          currency: 'CNY',
          exchangeRate: 1_000_000,
          amountBaseCents: 1250,
          fee: 0,
          accountId: 'acc-1',
          toAccountId: null,
          toAmount: null,
          categoryId: 'cat-1',
          projectId: null,
          date: 1751942400000,
          dateKey: '2026-07-08',
          note: '午餐',
          recurringRuleId: null,
          importBatchId: null,
          fingerprint: null,
          createdAt: 1751942400000,
          updatedAt: 1751942400000,
        },
      ],
      budgets: [
        {
          id: 'bud-1',
          period: 'month',
          categoryId: null,
          amount: 500000,
          alertPct: 80,
          enabled: 1,
          createdAt: 1751900000000,
          updatedAt: 1751900000000,
        },
      ],
      recurringRules: [],
      importBatches: [],
      importMappings: [],
      settings: [{ key: 'backup.lastBackupAt', value: '1751900000000' }],
    },
  };
}

describe('backupFileSchema', () => {
  it('合法备份通过校验', () => {
    expect(backupFileSchema.safeParse(validBackup()).success).toBe(true);
  });

  it('剥离未知字段（宽容第三方工具附加的键）', () => {
    const input = validBackup() as Record<string, unknown>;
    (input.data as Record<string, unknown[]>).accounts = [
      { ...(validBackup().data.accounts[0] as object), futureColumn: 'x' },
    ];
    const result = backupFileSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('futureColumn' in result.data.data.accounts[0]!).toBe(false);
    }
  });

  it.each(ACCOUNT_TYPES)('accepts current account type: %s', (type) => {
    const input = validBackup();
    input.data.accounts[0]!.type = type;
    expect(backupFileSchema.safeParse(input).success).toBe(true);
  });

  it('accepts transfer categories', () => {
    const input = validBackup();
    input.data.categories[0]!.type = 'transfer';
    expect(backupFileSchema.safeParse(input).success).toBe(true);
  });

  it.each(['credit', 'alipay', 'wechat', 'unexpected'])('rejects legacy account type: %s', (type) => {
    const input = validBackup();
    input.data.accounts[0]!.type = type;
    expect(backupFileSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    ['format 不匹配', (b: ReturnType<typeof validBackup>) => ({ ...b, format: 'other-app' })],
    [
      'schemaVersion 非正整数',
      (b: ReturnType<typeof validBackup>) => ({ ...b, schemaVersion: 1.5 }),
    ],
    [
      '缺少某张表',
      (b: ReturnType<typeof validBackup>) => {
        const { settings: _drop, ...rest } = b.data;
        return { ...b, data: rest };
      },
    ],
    [
      '金额为字符串',
      (b: ReturnType<typeof validBackup>) => {
        b.data.transactions[0]!.amount = '1250' as unknown as number;
        return b;
      },
    ],
    [
      'dateKey 格式非法',
      (b: ReturnType<typeof validBackup>) => {
        b.data.transactions[0]!.dateKey = '2026/07/08';
        return b;
      },
    ],
    [
      '交易类型非法',
      (b: ReturnType<typeof validBackup>) => {
        b.data.transactions[0]!.type = 'refund' as never;
        return b;
      },
    ],
    [
      '缺少 projects 表',
      (b: ReturnType<typeof validBackup>) => {
        const { projects: _drop, ...rest } = b.data;
        return { ...b, data: rest };
      },
    ],
    [
      'projectId 非字符串',
      (b: ReturnType<typeof validBackup>) => {
        b.data.transactions[0]!.projectId = 123 as unknown as null;
        return b;
      },
    ],
    [
      'budget 缺 period',
      (b: ReturnType<typeof validBackup>) => {
        const { period: _drop, ...rest } = b.data.budgets[0]!;
        b.data.budgets[0] = rest as never;
        return b;
      },
    ],
  ])('拒绝非法样例：%s', (_label, mutate) => {
    expect(backupFileSchema.safeParse(mutate(validBackup())).success).toBe(false);
  });
});

describe('backupEnvelopeSchema', () => {
  it('只校验 format/schemaVersion，data 形状不限（供升级链前置判定）', () => {
    const result = backupEnvelopeSchema.safeParse({
      format: 'finance-tracker-backup',
      schemaVersion: 1,
      data: { legacyShape: true },
    });
    expect(result.success).toBe(true);
  });

  it('拒绝非本 APP 的 JSON', () => {
    expect(backupEnvelopeSchema.safeParse({ hello: 'world' }).success).toBe(false);
  });
});
