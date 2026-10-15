import * as fs from 'expo-file-system/legacy';
import { pruneExternalSnapshots, pruneLocalSnapshots, saveLocalSnapshot } from '../storage';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/', makeDirectoryAsync: jest.fn(),
  readDirectoryAsync: jest.fn(), deleteAsync: jest.fn(), moveAsync: jest.fn(),
  writeAsStringAsync: jest.fn(), readAsStringAsync: jest.fn(),
  StorageAccessFramework: { readDirectoryAsync: jest.fn() },
}));

const content = JSON.stringify({ format: 'finance-tracker-backup', schemaVersion: 6,
  appVersion: '1', exportedAt: '2026-10-14', data: {
    accounts: [], categories: [], projects: [], transactions: [], budgets: [], recurringRules: [],
    importBatches: [], importMappings: [], settings: [],
  } });

beforeEach(() => { jest.clearAllMocks(); });

it('never promotes a partial or corrupted file to a completed backup', async () => {
  jest.mocked(fs.readAsStringAsync).mockResolvedValue('partial');
  await expect(saveLocalSnapshot('auto-backup-1791960000000.json', content)).rejects.toThrow('verification');
  expect(fs.moveAsync).not.toHaveBeenCalled();
});

it('verifies the complete file before promoting it', async () => {
  jest.mocked(fs.readAsStringAsync).mockResolvedValue(content);
  await expect(saveLocalSnapshot('auto-backup-1791960000000.json', content)).resolves.toContain('.json');
  expect(fs.moveAsync).toHaveBeenCalledWith({ from: 'file:///documents/backups/auto-backup-1791960000000.json.pending', to: 'file:///documents/backups/auto-backup-1791960000000.json' });
});

it('only prunes old automatic copies, preserving safety files and unrelated files', async () => {
  jest.mocked(fs.readDirectoryAsync).mockResolvedValue([
    'auto-backup-1791960000000.json', 'auto-backup-1791960000001.json',
    'auto-backup-1791960000002.json', 'safety-backup-1.json', 'config.json', 'unrelated.json',
  ]);
  await pruneLocalSnapshots(2);
  expect(fs.deleteAsync).toHaveBeenCalledTimes(1);
  expect(fs.deleteAsync).toHaveBeenCalledWith('file:///documents/backups/auto-backup-1791960000000.json', { idempotent: true });
});

it('restricts external cleanup to the owned filename pattern', async () => {
  const base = 'content://provider/tree/folder/document/primary%3ADocuments%2F';
  jest.mocked(fs.StorageAccessFramework.readDirectoryAsync).mockResolvedValue([
    base + 'auto-backup-1791960000000.json', base + 'auto-backup-1791960000001.json',
    base + 'family.json', base + 'safety-backup-1791960000000.json',
  ]);
  await pruneExternalSnapshots('content://folder', 1);
  expect(fs.deleteAsync).toHaveBeenCalledTimes(1);
  expect(fs.deleteAsync).toHaveBeenCalledWith(base + 'auto-backup-1791960000000.json', { idempotent: true });
});
