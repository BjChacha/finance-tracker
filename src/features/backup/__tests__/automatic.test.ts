import { configureAutoBackup, getAutoBackupConfig, isBackupDue, runAutoBackup } from '../automatic';
import { buildBackupFile } from '../repository';
import * as storage from '../storage';

jest.mock('../repository', () => ({ buildBackupFile: jest.fn(async () => ({ data: {} })) }));
jest.mock('../storage', () => ({
  readLocalConfig: jest.fn(), writeLocalConfig: jest.fn(), saveLocalSnapshot: jest.fn(),
  saveExternalSnapshot: jest.fn(), pruneLocalSnapshots: jest.fn(), pruneExternalSnapshots: jest.fn(),
}));

let config: Record<string, unknown>;
beforeEach(() => {
  jest.clearAllMocks();
  config = { enabled: true, directory: null, lastSuccessAt: null, lastError: null };
  jest.mocked(storage.readLocalConfig).mockImplementation(async () => config);
  jest.mocked(storage.writeLocalConfig).mockImplementation(async (next) => { config = next as Record<string, unknown>; });
  jest.mocked(storage.saveLocalSnapshot).mockResolvedValue('file://backup.json');
  jest.mocked(storage.saveExternalSnapshot).mockResolvedValue('content://backup.json');
});

it('serializes simultaneous triggers and only writes once per day', async () => {
  expect(await Promise.all([runAutoBackup(), runAutoBackup(), runAutoBackup()])).toEqual([true, false, false]);
  expect(buildBackupFile).toHaveBeenCalledTimes(1);
});

it('does not advance success or prune when the external write fails, and retries', async () => {
  config.directory = 'content://folder';
  jest.mocked(storage.saveExternalSnapshot).mockRejectedValueOnce(new Error('Permission revoked'));
  await expect(runAutoBackup()).rejects.toThrow('Permission revoked');
  expect(config.lastSuccessAt).toBeNull();
  expect(config.lastError).toBe('Permission revoked');
  expect(storage.pruneLocalSnapshots).not.toHaveBeenCalled();
  expect(await runAutoBackup()).toBe(true);
  expect(config.lastError).toBeNull();
});

it('retains the previous backup time on local failure', async () => {
  config.lastSuccessAt = 1;
  jest.mocked(storage.saveLocalSnapshot).mockRejectedValueOnce(new Error('Disk full'));
  await expect(runAutoBackup()).rejects.toThrow('Disk full');
  expect(config.lastSuccessAt).toBe(1);
  expect(storage.pruneLocalSnapshots).not.toHaveBeenCalled();
});

it('keeps manual backup available while automatic backup is disabled', async () => {
  config.enabled = false;
  expect(await runAutoBackup()).toBe(false);
  expect(await runAutoBackup(true)).toBe(true);
});

it('makes a newly selected destination due even after a successful backup today', async () => {
  await runAutoBackup();
  await configureAutoBackup({ directory: 'content://new-folder' });
  expect((await getAutoBackupConfig()).lastSuccessAt).toBeNull();
  expect(await runAutoBackup()).toBe(true);
  expect(storage.saveExternalSnapshot).toHaveBeenCalled();
});

it('uses local calendar dates and recovers from a clock rollback', () => {
  const morning = new Date(2026, 9, 14, 1).getTime();
  expect(isBackupDue(morning, new Date(2026, 9, 14, 22).getTime())).toBe(false);
  expect(isBackupDue(morning, new Date(2026, 9, 15, 0).getTime())).toBe(true);
  expect(isBackupDue(morning, morning - 1)).toBe(true);
});
