export type WeightedItem = { value: number };
export type TreeRect<T> = {
  item: T;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Split along the longer edge, preserving area rather than inflating small categories. */
export function treemapLayout<T extends WeightedItem>(
  items: T[],
  width: number,
  height: number,
): TreeRect<T>[] {
  if (width <= 0 || height <= 0) return [];
  const positive = items
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value);
  const result: TreeRect<T>[] = [];
  function divide(group: T[], x: number, y: number, w: number, h: number) {
    if (!group.length) return;
    if (group.length === 1) {
      result.push({ item: group[0]!, x, y, width: w, height: h });
      return;
    }
    const total = group.reduce((sum, item) => sum + item.value, 0);
    let cut = 1;
    let sum = group[0]!.value;
    while (
      cut < group.length - 1 &&
      Math.abs(sum + group[cut]!.value - total / 2) < Math.abs(sum - total / 2)
    ) {
      sum += group[cut++]!.value;
    }
    const ratio = sum / total;
    if (w >= h) {
      divide(group.slice(0, cut), x, y, w * ratio, h);
      divide(group.slice(cut), x + w * ratio, y, w * (1 - ratio), h);
    } else {
      divide(group.slice(0, cut), x, y, w, h * ratio);
      divide(group.slice(cut), x, y + h * ratio, w, h * (1 - ratio));
    }
  }
  divide(positive, 0, 0, width, height);
  return result;
}
