import { zh } from '@/i18n/zh';

export type DonutSlice = {
  id: string;
  label: string;
  value: number;
  color: string;
  icon?: string;
  pct: number;
};

export const OTHER_SLICE_ID = '__other__';

const TOP_SLICE_COUNT = 9;
const FALLBACK_CATEGORY_COLOR = '#9CA3AF';
const CATEGORICAL_PALETTE = [
  '#5470C6',
  '#91CC75',
  '#FAC858',
  '#EE6666',
  '#73C0DE',
  '#3BA272',
  '#FC8452',
  '#9A60B4',
  '#EA7CCC',
  '#2EC7C9',
] as const;

function normalizeColor(color: string): string {
  return color.trim().toUpperCase();
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickPaletteColor(id: string, usedColors: Set<string>): string {
  const start = stableHash(id) % CATEGORICAL_PALETTE.length;
  for (let offset = 0; offset < CATEGORICAL_PALETTE.length; offset++) {
    const color = CATEGORICAL_PALETTE[(start + offset) % CATEGORICAL_PALETTE.length]!;
    if (!usedColors.has(normalizeColor(color))) return color;
  }
  return CATEGORICAL_PALETTE[start]!;
}

function assignDistinctColors(slices: DonutSlice[], otherColor: string): DonutSlice[] {
  const normalizedOther = normalizeColor(otherColor);
  const usedColors = new Set<string>([normalizedOther]);

  return slices.map((slice) => {
    if (slice.id === OTHER_SLICE_ID) return { ...slice, color: otherColor };

    const normalized = normalizeColor(slice.color);
    const canKeepColor =
      normalized !== normalizeColor(FALLBACK_CATEGORY_COLOR) && !usedColors.has(normalized);
    const color = canKeepColor ? slice.color : pickPaletteColor(slice.id, usedColors);
    usedColors.add(normalizeColor(color));
    return { ...slice, color };
  });
}

export function buildDonutSlices(data: DonutSlice[], otherColor: string): DonutSlice[] {
  const sorted = [...data].sort((left, right) => right.value - left.value);
  const total = sorted.reduce((sum, slice) => sum + slice.value, 0);
  const visible = sorted.slice(0, TOP_SLICE_COUNT);

  if (sorted.length > TOP_SLICE_COUNT) {
    visible.push({
      id: OTHER_SLICE_ID,
      label: zh.stats.other,
      value: sorted.slice(TOP_SLICE_COUNT).reduce((sum, slice) => sum + slice.value, 0),
      color: otherColor,
      pct: 0,
    });
  }

  const withPercent = visible.map((slice) => ({
    ...slice,
    pct: total > 0 ? Math.round((slice.value / total) * 1_000) / 10 : 0,
  }));
  return assignDistinctColors(withPercent, otherColor);
}
