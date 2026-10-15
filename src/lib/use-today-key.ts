import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { dayjs, todayKey } from './date';

/** Refresh date-bound queries at local midnight and after resuming the app. */
export function useTodayKey(): string {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      setToday(todayKey());
      timer = setTimeout(
        refresh,
        Math.max(1000, dayjs().endOf('day').valueOf() - Date.now() + 100),
      );
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);
  return today;
}
