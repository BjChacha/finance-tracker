import { useEffect, useState } from 'react';

export function useProgressiveMount(
  enabled: boolean,
  maxStage: number,
  framesPerStage = 1,
): number {
  const normalizedMaxStage = Math.max(1, Math.trunc(maxStage));
  const normalizedFramesPerStage = Math.max(1, Math.trunc(framesPerStage));
  const [stage, setStage] = useState(enabled ? 1 : 0);

  useEffect(() => {
    if (!enabled) {
      setStage(0);
      return;
    }

    let cancelled = false;
    let frame: number | null = null;
    let nextStage = 1;
    let remainingFrames = normalizedFramesPerStage;
    setStage(1);

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
    return () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [enabled, normalizedFramesPerStage, normalizedMaxStage]);

  return stage;
}
