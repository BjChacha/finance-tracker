import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

jest.mock('@/db/client', () => ({
  db: { select: jest.fn(), update: jest.fn() },
}));

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/settings';
import { transactions } from '@/db/schema';
import {
  countLegacySmartNoteTransactions,
  getSmartTagMigrationDecision,
  migrateLegacySmartNotes,
  setSmartTagMigrationDecision,
} from '../smart-tag-migration';
import { LEGACY_SMART_NOTE_PREFIX, SMART_TAG } from '../tags';

const mockSelect = db.select as jest.Mock;
const mockUpdate = db.update as jest.Mock;

/** 让 `db.select(...).from(...).where(...)` 解析为给定行 */
function setupSelect(rows: unknown[]) {
  const where = jest.fn().mockResolvedValue(rows);
  mockSelect.mockReturnValue({ from: () => ({ where }) });
  return where;
}

/** 记录每次 `.set()` 的入参 */
function setupUpdate() {
  const calls: Record<string, unknown>[] = [];
  const where = jest.fn().mockResolvedValue(undefined);
  mockUpdate.mockReturnValue({
    set: (values: Record<string, unknown>) => {
      calls.push(values);
      return { where };
    },
  });
  return calls;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('countLegacySmartNoteTransactions', () => {
  it('按旧标记匹配备注并返回行数', async () => {
    const where = setupSelect([{ value: 3 }]);

    await expect(countLegacySmartNoteTransactions()).resolves.toBe(3);

    const compiled = new SQLiteSyncDialect().sqlToQuery(where.mock.calls[0]![0]);
    expect(compiled.sql).toContain('"transactions"."note"');
    expect(compiled.params).toContain(`%${LEGACY_SMART_NOTE_PREFIX}%`);
  });
});

describe('migrateLegacySmartNotes', () => {
  it('去掉备注前缀并追加「智能」标签，其余标签与文本保留', async () => {
    setupSelect([
      { id: 'tx-1', note: `${LEGACY_SMART_NOTE_PREFIX}午饭`, tags: [] },
      { id: 'tx-2', note: `${LEGACY_SMART_NOTE_PREFIX}`, tags: ['报销'] },
      { id: 'tx-3', note: `${LEGACY_SMART_NOTE_PREFIX}打车`, tags: [SMART_TAG] },
    ]);
    const setCalls = setupUpdate();

    await expect(migrateLegacySmartNotes()).resolves.toBe(3);

    expect(mockUpdate).toHaveBeenCalledWith(transactions);
    expect(setCalls[0]).toMatchObject({ note: '午饭', tags: [SMART_TAG] });
    expect(setCalls[1]).toMatchObject({ note: '', tags: ['报销', SMART_TAG] });
    // 已是「智能」的不重复追加（幂等重跑安全）
    expect(setCalls[2]).toMatchObject({ note: '打车', tags: [SMART_TAG] });
  });

  it('没有旧标记时一次也不写库', async () => {
    setupSelect([]);
    const setCalls = setupUpdate();

    await expect(migrateLegacySmartNotes()).resolves.toBe(0);
    expect(setCalls).toEqual([]);
  });
});

describe('迁移决定', () => {
  it('读取用户决定', async () => {
    jest.mocked(getSetting).mockResolvedValueOnce('declined');
    await expect(getSmartTagMigrationDecision()).resolves.toBe('declined');
  });

  it('把决定持久化到固定 settings key，便于只问一次', async () => {
    await setSmartTagMigrationDecision('converted');
    expect(setSetting).toHaveBeenCalledWith(
      'transactions.smartTagMigration.v1',
      'converted',
    );
  });
});
