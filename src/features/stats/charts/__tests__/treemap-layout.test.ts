import { treemapLayout } from '../treemap-layout';
import { sparklineGeometry } from '../sparkline-geometry';

it.each([[600, 200, 150, 50], [1, 1, 1, 1, 1, 1], [99999, 1], [25]])(
  'preserves category areas without overlap for %j',
  (...values) => {
    const items = values.map((value, index) => ({ value, id: index }));
    const rects = treemapLayout(items, 360, 132);
    const total = values.reduce((sum, value) => sum + value, 0);
    expect(
      rects.reduce((area, rect) => area + rect.width * rect.height, 0),
    ).toBeCloseTo(360 * 132);
    for (const rect of rects) {
      expect((rect.width * rect.height) / (360 * 132)).toBeCloseTo(
        rect.item.value / total,
      );
      expect(rect.x + rect.width).toBeLessThanOrEqual(360.000001);
      expect(rect.y + rect.height).toBeLessThanOrEqual(132.000001);
      for (const other of rects.filter((item) => item !== rect)) {
        const overlapWidth =
          Math.min(rect.x + rect.width, other.x + other.width) -
          Math.max(rect.x, other.x);
        const overlapHeight =
          Math.min(rect.y + rect.height, other.y + other.height) -
          Math.max(rect.y, other.y);
        expect(overlapWidth <= 0.000001 || overlapHeight <= 0.000001).toBe(
          true,
        );
      }
    }
  },
);

it('handles unmeasured containers and zero or invalid amounts', () => {
  expect(treemapLayout([{ value: 1 }], 0, 132)).toEqual([]);
  expect(
    treemapLayout([{ value: 0 }, { value: -1 }, { value: NaN }], 360, 132),
  ).toEqual([]);
});

it('plots negative, cross-zero, flat and single-point asset histories', () => {
  const crossing = sparklineGeometry([-200, 0, 200], 88, 38)!;
  expect(crossing.zeroY).toBe(19);
  expect(crossing.last).toEqual({ x: 85, y: 3 });
  expect(sparklineGeometry([-200, -100], 88, 38)?.zeroY).toBeNull();
  expect(sparklineGeometry([0, 0], 88, 38)?.path).toBe('M3,19 L85,19');
  expect(sparklineGeometry([100], 88, 38)?.last).toEqual({ x: 44, y: 19 });
  expect(sparklineGeometry([], 88, 38)).toBeNull();
});
