import {
  backupUpgraders,
  runUpgradeChain,
  type BackupUpgrader,
  type RawBackupPayload,
} from '../upgraders';

/** 构造 vN 假备份 */
function payloadAt(version: number, extra: Record<string, unknown> = {}): RawBackupPayload {
  return { format: 'finance-tracker-backup', schemaVersion: version, ...extra };
}

describe('runUpgradeChain', () => {
  it('目标版本等于当前版本时原样返回，不调用任何 upgrader', () => {
    const spy = jest.fn();
    const input = payloadAt(4);
    const out = runUpgradeChain(input, 4, 4, { 4: spy as unknown as BackupUpgrader });
    expect(out).toBe(input);
    expect(spy).not.toHaveBeenCalled();
  });

  it('v0 → v2 逐级调用 upgrader，顺序为 0 → 1', () => {
    const calls: number[] = [];
    const upgraders: Record<number, BackupUpgrader> = {
      0: (p) => {
        calls.push(0);
        return { ...p, schemaVersion: 1, step0: true };
      },
      1: (p) => {
        calls.push(1);
        return { ...p, schemaVersion: 2, step1: true };
      },
    };
    const out = runUpgradeChain(payloadAt(0), 0, 2, upgraders);
    expect(calls).toEqual([0, 1]);
    expect(out.schemaVersion).toBe(2);
    expect(out.step0).toBe(true);
    expect(out.step1).toBe(true);
  });

  it('后级 upgrader 收到前级的输出（链式传递）', () => {
    const upgraders: Record<number, BackupUpgrader> = {
      1: (p) => ({ ...p, schemaVersion: 2, marks: ['v1'] }),
      2: (p) => ({
        ...p,
        schemaVersion: 3,
        marks: [...(p.marks as string[]), 'v2'],
      }),
    };
    const out = runUpgradeChain(payloadAt(1), 1, 3, upgraders);
    expect(out.marks).toEqual(['v1', 'v2']);
  });

  it('缺失中间某级 upgrader 时抛错并指明版本', () => {
    const upgraders: Record<number, BackupUpgrader> = {
      1: (p) => ({ ...p, schemaVersion: 2 }),
      // 缺 2 → 3
    };
    expect(() => runUpgradeChain(payloadAt(1), 1, 3, upgraders)).toThrow('v2 → v3');
  });
});

describe('backupUpgraders[1]（v1 → v2 多币种回填）', () => {
  const upgrade = backupUpgraders[1]!;

  it('transactions 补 currency/exchangeRate/amountBaseCents；转账 toAmount=amount', () => {
    const out = upgrade({
      ...payloadAt(1),
      data: {
        accounts: [{ id: 'a', amount: 1 }],
        transactions: [
          { id: 't1', type: 'expense', amount: 1250 },
          { id: 't2', type: 'transfer', amount: 5000 },
        ],
      },
    }) as RawBackupPayload & { data: { transactions: Record<string, unknown>[] } };
    expect(out.schemaVersion).toBe(2);
    const [exp, trf] = out.data.transactions;
    expect(exp).toMatchObject({
      currency: 'CNY',
      exchangeRate: 1_000_000,
      amountBaseCents: 1250,
      toAmount: null,
    });
    expect(trf).toMatchObject({
      currency: 'CNY',
      exchangeRate: 1_000_000,
      amountBaseCents: 5000,
      toAmount: 5000,
    });
  });

  it('accounts 补 rateToBase=1e6', () => {
    const out = upgrade({
      ...payloadAt(1),
      data: { accounts: [{ id: 'a', currency: 'CNY' }], transactions: [] },
    }) as RawBackupPayload & { data: { accounts: Record<string, unknown>[] } };
    expect(out.data.accounts[0]).toMatchObject({ rateToBase: 1_000_000 });
  });

  it('缺 data / 空数组时不抛错', () => {
    expect(() => upgrade(payloadAt(1))).not.toThrow();
  });
});

describe('backupUpgraders[2]（v2 → v3 项目机制）', () => {
  const upgrade = backupUpgraders[2]!;

  it('transactions 补 projectId=null；新增空 projects；升到 v3', () => {
    const out = upgrade({
      ...payloadAt(2),
      data: {
        transactions: [
          { id: 't1', type: 'expense', amount: 1250 },
          { id: 't2', type: 'transfer', amount: 5000 },
        ],
      },
    }) as RawBackupPayload & {
      data: { transactions: Record<string, unknown>[]; projects: unknown[] };
    };
    expect(out.schemaVersion).toBe(3);
    expect(out.data.projects).toEqual([]);
    expect(out.data.transactions.every((t) => t.projectId === null)).toBe(true);
  });

  it('保留 transactions 上既有字段', () => {
    const out = upgrade({
      ...payloadAt(2),
      data: { transactions: [{ id: 't1', type: 'expense', amount: 1250, note: '午餐' }] },
    }) as RawBackupPayload & { data: { transactions: Record<string, unknown>[] } };
    expect(out.data.transactions[0]).toMatchObject({ id: 't1', note: '午餐', projectId: null });
  });

  it('缺 data / 空数组时不抛错', () => {
    expect(() => upgrade(payloadAt(2))).not.toThrow();
  });
});

describe('backupUpgraders[3] (v3 -> v4 account types)', () => {
  const upgrade = backupUpgraders[3]!;

  it('normalizes legacy and unknown account types', () => {
    const out = upgrade({
      ...payloadAt(3),
      data: {
        accounts: [
          { id: 'cash', type: 'cash' },
          { id: 'bank', type: 'bank' },
          { id: 'credit', type: 'credit' },
          { id: 'alipay', type: 'alipay' },
          { id: 'wechat', type: 'wechat' },
          { id: 'other', type: 'other' },
          { id: 'unknown', type: 'future_type' },
        ],
        transactions: [{ id: 'tx-1' }],
      },
    }) as RawBackupPayload & {
      data: { accounts: Record<string, unknown>[]; transactions: Record<string, unknown>[] };
    };

    expect(out.schemaVersion).toBe(4);
    expect(out.data.accounts.map((account) => account.type)).toEqual([
      'cash',
      'bank',
      'credit_card',
      'other',
      'other',
      'other',
      'other',
    ]);
    expect(out.data.transactions).toEqual([{ id: 'tx-1' }]);
  });

  it('preserves current account types and account fields', () => {
    const out = upgrade({
      ...payloadAt(3),
      data: {
        accounts: [
          { id: 'wallet', name: 'Wallet', type: 'digital_wallet', initialBalance: 100 },
          { id: 'transit', name: 'Transit', type: 'stored_value_card', initialBalance: 200 },
          { id: 'credit', name: 'Credit', type: 'online_credit', initialBalance: -300 },
        ],
      },
    }) as RawBackupPayload & { data: { accounts: Record<string, unknown>[] } };

    expect(out.data.accounts).toEqual([
      { id: 'wallet', name: 'Wallet', type: 'digital_wallet', initialBalance: 100 },
      { id: 'transit', name: 'Transit', type: 'stored_value_card', initialBalance: 200 },
      { id: 'credit', name: 'Credit', type: 'online_credit', initialBalance: -300 },
    ]);
  });

  it('supports the complete v1 -> v4 upgrade chain', () => {
    const out = runUpgradeChain(
      {
        ...payloadAt(1),
        data: {
          accounts: [{ id: 'account', type: 'credit', currency: 'CNY' }],
          transactions: [{ id: 'tx', type: 'expense', amount: 1250 }],
        },
      },
      1,
      4,
    ) as RawBackupPayload & {
      data: {
        accounts: Record<string, unknown>[];
        transactions: Record<string, unknown>[];
        projects: unknown[];
      };
    };

    expect(out.schemaVersion).toBe(4);
    expect(out.data.accounts[0]).toMatchObject({
      type: 'credit_card',
      rateToBase: 1_000_000,
    });
    expect(out.data.transactions[0]).toMatchObject({
      currency: 'CNY',
      amountBaseCents: 1250,
      projectId: null,
    });
    expect(out.data.projects).toEqual([]);
  });
});
