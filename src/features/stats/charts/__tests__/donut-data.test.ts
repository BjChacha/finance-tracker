import { buildDonutSlices, OTHER_SLICE_ID, type DonutSlice } from '../donut-data';

function makeSlice(index: number, color = '#9CA3AF'): DonutSlice {
  return {
    id: `category-${index}`,
    label: `Category ${index}`,
    value: 1_000 - index * 10,
    color,
    pct: 0,
  };
}

describe('buildDonutSlices', () => {
  it('keeps the top nine categories and aggregates the remainder', () => {
    const input = Array.from({ length: 12 }, (_, index) => makeSlice(index));

    const result = buildDonutSlices(input, '#78716C');

    expect(result).toHaveLength(10);
    expect(result.slice(0, 9).map((slice) => slice.id)).toEqual(
      input.slice(0, 9).map((slice) => slice.id),
    );
    expect(result[9]).toMatchObject({
      id: OTHER_SLICE_ID,
      value: input.slice(9).reduce((sum, slice) => sum + slice.value, 0),
      color: '#78716C',
    });
    expect(result.reduce((sum, slice) => sum + slice.value, 0)).toBe(
      input.reduce((sum, slice) => sum + slice.value, 0),
    );
    expect(result.reduce((sum, slice) => sum + slice.pct, 0)).toBeCloseTo(100, 1);
  });

  it('replaces fallback and duplicate colors with stable distinct colors', () => {
    const input = [
      makeSlice(0),
      makeSlice(1),
      makeSlice(2, '#3B82F6'),
      makeSlice(3, '#3B82F6'),
    ];

    const first = buildDonutSlices(input, '#78716C');
    const second = buildDonutSlices([...input].reverse(), '#78716C');
    const firstColors = new Map(first.map((slice) => [slice.id, slice.color]));
    const secondColors = new Map(second.map((slice) => [slice.id, slice.color]));

    expect(new Set(first.map((slice) => slice.color)).size).toBe(first.length);
    expect(firstColors.get('category-0')).not.toBe('#9CA3AF');
    expect(firstColors.get('category-2')).toBe('#3B82F6');
    expect(secondColors).toEqual(firstColors);
  });
});
