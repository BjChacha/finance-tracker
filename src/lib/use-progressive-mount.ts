import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

export function useProgressiveMount(
  enabled: boolean,
  maxStage: number,
  framesPerStage = 1,
): number {
  const normalizedMaxStage = Math.max(1, Math.trunc(maxStage));
  const normalizedFramesPerStage = Math.max(1, Math.trunc(framesPerStage));
  const [stage, setStage] = useState(enabled ? 1 : 0);
  const stageRef = useRef(stage);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    if (!enabled) {
      setStage(0);
      return;
    }
    setStage(1);

    let cancelled = false;
    let frame: number | null = null;

    const advanceFrom = (fromStage: number) => {
      let nextStage = fromStage;
      let remainingFrames = normalizedFramesPerStage;
      const advance = () => {
        if (cancelled || nextStage >= normalizedMaxStage) return;
        frame = requestAnimationFrame(() => {
          frame = null;
          if (cancelled) return;
          remainingFrames -= 1;
          if (remainingFrames === 0) {
            nextStage += 1;
            remainingFrames = normalizedFramesPerStage;
            setStage(nextStage);
          }
          advance();
        });
      };
      advance();
    };

    advanceFrom(1);

    // vsync-backed rAF callbacks are dropped while the app is backgrounded (opening the
    // native quick keypad does exactly that); without a foreground re-kick the mount
    // stays half-staged forever.
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') return;
      if (cancelled || stageRef.current >= normalizedMaxStage) return;
      if (frame !== null) cancelAnimationFrame(frame);
      advanceFrom(stageRef.current);
    });
    return () => {
      cancelled = true;
      subscription.remove();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [enabled, normalizedFramesPerStage, normalizedMaxStage]);

  return stage;
}
