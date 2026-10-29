import {
  monotonePath,
  sampleToPointIndex,
  smoothSamples,
} from '../smooth-line';

const K = 6;

it('keeps a zero-based series from dipping below zero', () => {
  const samples = smoothSamples([0, 0, 500, 0, 0], K);
  expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...samples)).toBeLessThanOrEqual(500);
});

it('never overshoots the neighbouring values on a spike', () => {
  const values = [100, 950, 120, 130, 128];
  const samples = smoothSamples(values, K);
  expect(Math.min(...samples)).toBeGreaterThanOrEqual(Math.min(...values));
  expect(Math.max(...samples)).toBeLessThanOrEqual(Math.max(...values));
});

it('keeps a flat run flat instead of bulging', () => {
  const samples = smoothSamples([0, 0, 0, 0], K);
  expect(new Set(samples)).toEqual(new Set([0]));
});

it('preserves both endpoints and the sampling grid', () => {
  const values = [10, 40, 20, 80];
  const samples = smoothSamples(values, K);
  expect(samples).toHaveLength((values.length - 1) * K + 1);
  expect(samples[0]).toBe(10);
  expect(samples[samples.length - 1]).toBe(80);
  expect(samples[K]).toBe(40);
  expect(samples[K * 2]).toBe(20);
});

it('leaves one or two points untouched', () => {
  expect(smoothSamples([42], K)).toEqual([42]);
  expect(smoothSamples([42, 7], K)).toEqual([42, 7]);
});

it('maps a dense sample back to its owning point', () => {
  expect(sampleToPointIndex(0, 4, K)).toBe(0);
  expect(sampleToPointIndex(K * 2 + 2, 4, K)).toBe(2);
  expect(sampleToPointIndex(K * 3, 4, K)).toBe(3);
  expect(sampleToPointIndex(999, 4, K)).toBe(3);
  expect(sampleToPointIndex(1, 2, K)).toBe(1);
});

it('emits one cubic segment per interval', () => {
  const path = monotonePath([
    { x: 0, y: 10 },
    { x: 10, y: 0 },
    { x: 20, y: 30 },
  ]);
  expect(path.startsWith('M0,10')).toBe(true);
  expect(path.match(/C/g)).toHaveLength(2);
  expect(monotonePath([{ x: 4, y: 5 }])).toBe('M4,5');
  expect(monotonePath([])).toBe('');
});

it('keeps the curve inside the segment value range', () => {
  // y 轴向下增长：这里只关心控制点不越过两端，故直接在数值空间断言
  const points = [
    { x: 0, y: 0 },
    { x: 10, y: 100 },
    { x: 20, y: 0 },
  ];
  const path = monotonePath(points);
  const controlY = [...path.matchAll(/C[\d.]+,(-?[\d.]+) (-?[\d.]+),/g)].flatMap(
    (match) => [Number(match[1]), Number(match[2])],
  );
  for (const y of controlY) {
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(100);
  }
});
