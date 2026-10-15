import * as FileSystem from 'expo-file-system/legacy';
import { backupFileSchema } from './schema';

const root = () => {
  if (!FileSystem.documentDirectory) throw new Error('Persistent storage is unavailable');
  return `${FileSystem.documentDirectory}backups/`;
};

export type SavedBackup = { name: string; uri: string };

export async function listLocalSnapshots(): Promise<SavedBackup[]> {
  await FileSystem.makeDirectoryAsync(root(), { intermediates: true });
  return (await FileSystem.readDirectoryAsync(root()))
    .filter((name) => /^(auto|safety)-backup-[\d-]+\.json$/.test(name))
    .sort().reverse().map((name) => ({ name, uri: root() + name }));
}

export async function saveLocalSnapshot(name: string, content: string): Promise<string> {
  backupFileSchema.parse(JSON.parse(content));
  await FileSystem.makeDirectoryAsync(root(), { intermediates: true });
  const uri = root() + name;
  const pending = uri + '.pending';
  await FileSystem.writeAsStringAsync(pending, content);
  const verified = await FileSystem.readAsStringAsync(pending);
  if (verified !== content) throw new Error('Backup verification failed');
  await FileSystem.moveAsync({ from: pending, to: uri });
  return uri;
}

export async function readLocalConfig(): Promise<unknown> {
  const uri = root() + 'config.json';
  if (!(await FileSystem.getInfoAsync(uri)).exists) return null;
  return JSON.parse(await FileSystem.readAsStringAsync(uri));
}

export async function writeLocalConfig(config: unknown): Promise<void> {
  await FileSystem.makeDirectoryAsync(root(), { intermediates: true });
  const uri = root() + 'config.json';
  await FileSystem.writeAsStringAsync(uri + '.pending', JSON.stringify(config));
  await FileSystem.moveAsync({ from: uri + '.pending', to: uri });
}

export async function chooseBackupDirectory(): Promise<string | null> {
  const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  return result.granted ? result.directoryUri : null;
}

export async function saveExternalSnapshot(directory: string, name: string, content: string): Promise<string> {
  const uri = await FileSystem.StorageAccessFramework.createFileAsync(directory, name, 'application/json');
  try {
    await FileSystem.writeAsStringAsync(uri, content);
    if (await FileSystem.readAsStringAsync(uri) !== content) throw new Error('Backup verification failed');
    return uri;
  } catch (error) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    throw error;
  }
}

export async function pruneLocalSnapshots(keep = 30): Promise<void> {
  const files = (await listLocalSnapshots()).filter((file) => file.name.startsWith('auto-'));
  for (const file of files.slice(keep)) await FileSystem.deleteAsync(file.uri, { idempotent: true });
}

export async function pruneExternalSnapshots(directory: string, keep = 30): Promise<void> {
  const files = (await FileSystem.StorageAccessFramework.readDirectoryAsync(directory))
    .map((uri) => ({ uri, name: decodeURIComponent(uri).split('/').pop() ?? '' }))
    .filter(({ name }) => /^auto-backup-\d{13}\.json$/.test(name))
    .sort((a, b) => b.name.localeCompare(a.name));
  for (const file of files.slice(keep)) await FileSystem.deleteAsync(file.uri, { idempotent: true });
}
