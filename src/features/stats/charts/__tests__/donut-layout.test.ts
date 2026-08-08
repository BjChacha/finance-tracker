import {
  DONUT_LABEL_MIN_GAP,
  layoutDonutLabels,
} from '../donut-layout';
import type { DonutSlice } from '../donut-data';

const values = [35.7, 16.2, 11.3, 10.7, 6.2, 6.1, 4.6, 3.1, 3.1, 2.9];

const slices: DonutSlice[] = values.map((value, index) => ({
  id: `category-${index}`,
  label: index === 2 ? 'Electronic products' : `Category ${index}`,
  value,
  pct: value,
  color: '#5470C6',
}));

describe('layoutDonutLabels', () => {
  it('keeps a dense ten-label layout inside the canvas without overlap', () => {
    const width = 333;
    const height = 208;

    const labels = layoutDonutLabels(slices, { width, height });

    expect(labels).toHaveLength(slices.length);
    for (const label of labels) {
      expect(label.bounds.left).toBeGreaterThanOrEqual(0);
      expect(label.bounds.right).toBeLessThanOrEqual(width);
      expect(label.y).toBeGreaterThan(0);
      expect(label.y).toBeLessThan(height);
    }

    for (const side of ['left', 'right'] as const) {
      const sideLabels = labels.filter((label) => label.side === side).sort((a, b) => a.y - b.y);
      for (let index = 1; index < sideLabels.length; index++) {
        expect(sideLabels[index]!.y - sideLabels[index - 1]!.y).toBeGreaterThanOrEqual(
          DONUT_LABEL_MIN_GAP,
        );
      }
    }
  });

  it('places leader-line endpoints outside label text', () => {
    const labels = layoutDonutLabels(slices, { width: 333, height: 208 });

    for (const label of labels) {
      const lineEnd = label.linePoints[2]!;
      if (label.side === 'left') {
        expect(lineEnd.x).toBeGreaterThanOrEqual(label.bounds.right);
      } else {
        expect(lineEnd.x).toBeLessThanOrEqual(label.bounds.left);
      }
    }
  });
});
