import { restoreBackup } from '../repository';
import { readTextFromUri } from '@/lib/fs';
import { saveLocalSnapshot } from '../storage';
import { db } from '@/db/client';

jest.mock('@/lib/fs', () => ({ readTextFromUri: jest.fn(), shareFile: jest.fn(), writeTextToCache: jest.fn() }));
jest.mock('../storage', () => ({ saveLocalSnapshot: jest.fn(async () => 'file://safety.json') }));
jest.mock('@/db/client', () => ({ db: { transaction: jest.fn(), select: jest.fn(), delete: jest.fn(), insert: jest.fn() } }));

let events: string[];
let inside: boolean;
const fixture = { format: 'finance-tracker-backup', schemaVersion: 6, appVersion: '1', exportedAt: '2026-10-14',
  data: { accounts: [], categories: [], projects: [], transactions: [], budgets: [], recurringRules: [], importBatches: [], importMappings: [], settings: [{ key: 'example', value: '1' }] } };

beforeEach(() => {
  jest.clearAllMocks(); events = []; inside = false;
  (db.transaction as jest.Mock).mockImplementation((work) => {
    inside = true; events.push('begin');
    try { const result = work(db); events.push('commit'); return result; }
    catch (error) { events.push('rollback'); throw error; }
    finally { inside = false; }
  });
  (db.select as jest.Mock).mockReturnValue({ from: () => ({ all: () => [] }) });
  (db.delete as jest.Mock).mockReturnValue({ run: () => {
    if (!inside) throw new Error('Delete escaped transaction'); events.push('delete');
  } });
  (db.insert as jest.Mock).mockReturnValue({ values: () => ({ run: () => {
    if (!inside) throw new Error('Insert escaped transaction'); events.push('insert');
  } }) });
  jest.mocked(readTextFromUri).mockResolvedValue(JSON.stringify(fixture));
  jest.mocked(saveLocalSnapshot).mockResolvedValue('file://safety.json');
});

it('finishes all restore writes before the synchronous driver commits', async () => {
  await restoreBackup('file://source.json');
  expect(events.slice(-12)).toEqual(['begin', ...Array(9).fill('delete'), 'insert', 'commit']);
});

it('rolls back the whole restore when an insert fails', async () => {
  (db.insert as jest.Mock).mockReturnValue({ values: () => ({ run: () => { throw new Error('Foreign key'); } }) });
  await expect(restoreBackup('file://source.json')).rejects.toThrow('Foreign key');
  expect(events.at(-1)).toBe('rollback');
});

it('does not delete anything if the safety snapshot cannot be saved', async () => {
  jest.mocked(saveLocalSnapshot).mockRejectedValueOnce(new Error('Disk full'));
  await expect(restoreBackup('file://source.json')).rejects.toThrow('Disk full');
  expect(db.delete).not.toHaveBeenCalled();
});
