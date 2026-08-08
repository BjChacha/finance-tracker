import { Vibration } from 'react-native';
import { getSettingSync, setSetting } from '@/db/settings';

/** 按键震动档位：0=关闭 / 1=轻柔 / 2=强烈 */
export type HapticLevel = 0 | 1 | 2;

const KEY = 'haptic.level';
/** 各档震动时长（ms）；0 = 不震。Android 按时长区分强度；iOS Vibration 忽略时长（统一一下）。 */
const DURATION_MS: Record<HapticLevel, number> = { 0: 0, 1: 12, 2: 28 };

/** 同步读取震动档位（缺省 1=轻柔）。键盘按下时现读现用，避免 React 状态时延。 */
export function getHapticLevelSync(): HapticLevel {
  const v = getSettingSync<number>(KEY);
  return v === 0 || v === 1 || v === 2 ? (v as HapticLevel) : 1;
}

/** 写入震动档位（设置页用）。数字存库，value 列是裸数字，便于原生直接 toInt。 */
export function setHapticLevel(level: HapticLevel): Promise<void> {
  return setSetting(KEY, level);
}

/** 记账键盘按键触发震动（按当前档位）。 */
export function fireKeypadHaptic(): void {
  const ms = DURATION_MS[getHapticLevelSync()];
  if (ms > 0) Vibration.vibrate(ms);
}
