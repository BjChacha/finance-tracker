import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { runAutoBackup } from './automatic';

export function AutomaticBackupRunner() {
  const client = useQueryClient();
  useEffect(() => {
    const run = () => {
      if (AppState.currentState !== 'active') return;
      void runAutoBackup().catch((error: unknown) => {
        console.error('Automatic backup failed', error);
      }).finally(() => { void client.invalidateQueries({ queryKey: ['backup'] }); });
    };
    // Let startup migrations, seeding and recurring catch-up settle first.
    const initial = setTimeout(run, 10_000);
    const timer = setInterval(run, 5 * 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => { clearTimeout(initial); clearInterval(timer); subscription.remove(); };
  }, [client]);
  return null;
}
