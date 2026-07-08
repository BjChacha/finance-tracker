import { runUpgradeChain, type BackupUpgrader, type RawBackupPayload } from '../upgraders';

/** 构造 vN 假备份 */
function payloadAt(version: number, extra: Record<string, unknown> = {}): RawBackupPayload {
  return { format: 'finance-tracker-backup', schemaVersion: version, ...extra };
}

describe('runUpgradeChain', () => {
  it('目标版本等于当前版本时原样返回，不调用任何 upgrader', () => {
    const spy = jest.fn();
    const input = payloadAt(3);
    const out = runUpgradeChain(input, 3, 3, { 3: spy as unknown as BackupUpgrader });
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
