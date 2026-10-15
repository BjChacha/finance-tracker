import { lineAxis } from '../line-axis';

describe('lineAxis', () => {
  it.each([
    [0, 0],
    [-100, -50],
    [-200, 100],
    [10000, 10100],
    [0.01, 0.02],
  ])('contains every value in %j', (...values) => {
    const axis = lineAxis(values);
    expect(axis.stepValue).toBeGreaterThan(0);
    expect(axis.noOfSections).toBeGreaterThan(0);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(
        axis.yAxisOffset - axis.noOfSectionsBelowXAxis * axis.stepValue,
      );
      expect(value).toBeLessThanOrEqual(axis.yAxisOffset + axis.maxValue);
    }
  });
});
