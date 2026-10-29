/**
 * 平滑曲线的几何实现。
 *
 * 图表库自带的 `curved` 用 Catmull-Rom 风格的三次贝塞尔，控制点按前后点连线的
 * 切向伸出，数据剧烈起伏时会「过冲」——典型症状是接近 0 的序列被平滑到负值，
 * 或平段被顶出假峰值。资产曲线恰好是最容易踩到这个坑的（余额长期贴近 0 或
 * 在一段里几乎不动）。
 *
 * 这里改用 Fritsch–Carlson 单调三次 Hermite 插值：
 * - 每段的三次曲线严格落在该段两端的值之间 → 全局最值等于数据最值，不会过冲；
 * - 局部极值处斜率被压成 0 → 平段保持水平，不会出现「波浪」；
 * - 段间斜率连续 → 视觉上仍是平滑曲线。
 *
 * 两种输出：
 * - {@link smoothSamples}：均匀重采样成密集折线，供只接受折线的图表库使用；
 * - {@link monotonePath}：直接生成 SVG `C` 路径，供自绘折线（迷你曲线）使用。
 */
export type Pt = { x: number; y: number };

/** 每段插值到稠密折线时的采样数；6 段足以让屏幕上看不出折角 */
export const SMOOTH_SAMPLES_PER_SEGMENT = 6;

/** Fritsch–Carlson 斜率：先取相邻差分的中心斜率，再按单调性收紧 */
function monotoneSlopes(points: readonly Pt[]): number[] {
  const n = points.length;
  const slopes = new Array<number>(n).fill(0);
  if (n < 2) return slopes;
  const deltas = new Array<number>(n - 1);
  const widths = new Array<number>(n - 1);
  for (let i = 0; i < n - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    widths[i] = b.x - a.x;
    // 退化的重复 x 视为零斜率，避免除零
    deltas[i] = widths[i] === 0 ? 0 : (b.y - a.y) / widths[i]!;
  }
  slopes[0] = deltas[0]!;
  slopes[n - 1] = deltas[n - 2]!;
  for (let i = 1; i < n - 1; i += 1) {
    const before = deltas[i - 1]!;
    const after = deltas[i]!;
    slopes[i] = before * after <= 0 ? 0 : (before + after) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    const delta = deltas[i]!;
    if (delta === 0) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
      continue;
    }
    const start = slopes[i]! / delta;
    const end = slopes[i + 1]! / delta;
    const magnitude = start * start + end * end;
    if (magnitude > 9) {
      const scale = (3 / Math.sqrt(magnitude)) * delta;
      slopes[i] = scale * start;
      slopes[i + 1] = scale * end;
    }
  }
  return slopes;
}

function hermite(
  y0: number,
  y1: number,
  m0: number,
  m1: number,
  t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * y0 +
    (t3 - 2 * t2 + t) * m0 +
    (-2 * t3 + 3 * t2) * y1 +
    (t3 - t2) * m1
  );
}

/**
 * 把等间距序列重采样成平滑的密集序列（长度 = (n-1) * samplesPerSegment + 1）。
 * 每个采样值都落在其所属原始段的值域内，因此不会越过数据的最小/最大值。
 */
export function smoothSamples(
  values: readonly number[],
  samplesPerSegment: number = SMOOTH_SAMPLES_PER_SEGMENT,
): number[] {
  const n = values.length;
  if (n < 3 || samplesPerSegment < 2) return values.slice();
  const points: Pt[] = values.map((y, x) => ({ x, y }));
  const slopes = monotoneSlopes(points);
  const out: number[] = [values[0]!];
  for (let i = 0; i < n - 1; i += 1) {
    const y0 = values[i]!;
    const y1 = values[i + 1]!;
    const m0 = slopes[i]!;
    const m1 = slopes[i + 1]!;
    const isLast = i === n - 2;
    const lastStep = isLast ? samplesPerSegment - 1 : samplesPerSegment;
    for (let step = 1; step <= lastStep; step += 1) {
      out.push(hermite(y0, y1, m0, m1, step / samplesPerSegment));
    }
  }
  out.push(values[n - 1]!);
  return out;
}

/** 稠密采样下标 → 原始点下标（focus 交互用） */
export function sampleToPointIndex(
  sampleIndex: number,
  pointCount: number,
  samplesPerSegment: number = SMOOTH_SAMPLES_PER_SEGMENT,
): number {
  if (pointCount <= 2 || samplesPerSegment < 2) {
    return Math.max(0, Math.min(pointCount - 1, sampleIndex));
  }
  const index = Math.round(sampleIndex / samplesPerSegment);
  return Math.max(0, Math.min(pointCount - 1, index));
}

/** 单调三次 Hermite 路径：控制点由两端斜率决定，不会越过两端 y 值 */
export function monotonePath(points: readonly Pt[]): string {
  if (!points.length) return '';
  const first = points[0]!;
  if (points.length === 1) return `M${first.x},${first.y}`;
  const slopes = monotoneSlopes(points);
  let path = `M${first.x},${first.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const h = b.x - a.x;
    const c1x = a.x + h / 3;
    const c1y = a.y + (slopes[i]! * h) / 3;
    const c2x = b.x - h / 3;
    const c2y = b.y - (slopes[i + 1]! * h) / 3;
    path += ` C${c1x},${c1y} ${c2x},${c2y} ${b.x},${b.y}`;
  }
  return path;
}
