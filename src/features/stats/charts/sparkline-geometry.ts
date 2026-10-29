import { monotonePath, type Pt } from './smooth-line';

export function sparklineGeometry(
  values: number[],
  width: number,
  height: number,
) {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const y = (value: number) =>
    span === 0
      ? height / 2
      : height - 3 - ((value - min) / span) * (height - 6);
  const points: Pt[] = values.map((value, index) => ({
    x:
      values.length === 1
        ? width / 2
        : 3 + (index / (values.length - 1)) * (width - 6),
    y: y(value),
  }));
  return {
    // 单调三次插值：迷你曲线同样不允许被平滑到相邻点之外（0 附近尤其明显）
    path: monotonePath(points),
    last: points[points.length - 1]!,
    zeroY: min < 0 && max > 0 ? y(0) : null,
  };
}
