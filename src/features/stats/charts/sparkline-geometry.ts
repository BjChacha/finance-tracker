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
  const points = values.map((value, index) => ({
    x:
      values.length === 1
        ? width / 2
        : 3 + (index / (values.length - 1)) * (width - 6),
    y: y(value),
  }));
  return {
    path: points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
      .join(' '),
    last: points[points.length - 1]!,
    zeroY: min < 0 && max > 0 ? y(0) : null,
  };
}
