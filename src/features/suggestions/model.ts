/**
 * 智能分类推荐:使用基线(Baseline)的构建与打分,全部为纯函数。
 *
 * 基线 = 近 6 个月交易按 type+分类聚合出的「去重金额表」(次数 + 最近日期),
 * 预计算后由 repository 存入 settings 表;输入金额时对基线打分:
 *
 *   score(分类) = Σ_amounts kernel(cents, 输入) × (1 + ln(count)) × 0.5^(距今天数/半衰期)
 *   kernel:精确相等 → EXACT_BONUS;否则 exp(-(ln(cents/输入))² / (2σ²))
 */

export const BASELINE_VERSION = 1;
/** 基线回溯窗口(天),约 6 个月 */
export const BASELINE_WINDOW_DAYS = 183;
/** 每分类去重金额表截断上限,控制 JSON 体积 */
export const MAX_AMOUNTS_PER_CATEGORY = 40;
/** 对数金额核宽度:±20% 权重≈0.6,±40%≈0.18 */
export const SIGMA = 0.18;
/** 金额精确命中加成 */
export const EXACT_BONUS = 3;
/** 近期性半衰期(天) */
export const RECENCY_HALF_LIFE_DAYS = 45;
/** 自动预选门槛:昨日单次精确命中≈2.9 通过,90 天前 ±20% 单次≈0.15 不通过 */
export const AUTO_SELECT_MIN_SCORE = 0.35;
/** 参与网格重排的候选门槛,低于此分视为噪音 */
export const CANDIDATE_MIN_SCORE = 0.15;

export type SuggestType = 'expense' | 'income';

/** 基线原始输入:一笔历史交易的最小投影 */
export type BaselineRow = {
  type: SuggestType;
  categoryId: string;
  amount: number;
  dateKey: string;
};

/** 去重金额:出现次数 + 最近一次日期(打分时相对「今天」算衰减,基线不随时间失真) */
export type AmountStat = { cents: number; count: number; lastDateKey: string };

export type BaselineEntry = {
  categoryId: string;
  /** 窗口内总笔数(不受金额表截断影响) */
  count: number;
  /** 按 count 降序、lastDateKey 降序截断到 MAX_AMOUNTS_PER_CATEGORY */
  amounts: AmountStat[];
};

export type Baseline = {
  v: typeof BASELINE_VERSION;
  entries: Record<SuggestType, BaselineEntry[]>;
};

/** 交易签名:精确判断基线是否过期(增删改/导入/恢复备份都会改变它) */
export type TxSignature = { count: number; maxUpdatedAt: number };

export type StoredBaseline = {
  baseline: Baseline;
  meta: { builtAt: number; txCount: number; maxUpdatedAt: number };
};

/** 把窗口内的历史交易聚合成基线 */
export function buildBaseline(rows: BaselineRow[]): Baseline {
  const entries: Record<SuggestType, BaselineEntry[]> = { expense: [], income: [] };

  for (const type of ['expense', 'income'] as const) {
    // categoryId → (cents → AmountStat)
    const byCategory = new Map<string, { count: number; amounts: Map<number, AmountStat> }>();
    for (const r of rows) {
      if (r.type !== type) continue;
      let cat = byCategory.get(r.categoryId);
      if (!cat) {
        cat = { count: 0, amounts: new Map() };
        byCategory.set(r.categoryId, cat);
      }
      cat.count += 1;
      const stat = cat.amounts.get(r.amount);
      if (!stat) {
        cat.amounts.set(r.amount, { cents: r.amount, count: 1, lastDateKey: r.dateKey });
      } else {
        stat.count += 1;
        if (r.dateKey > stat.lastDateKey) stat.lastDateKey = r.dateKey;
      }
    }

    for (const [categoryId, cat] of byCategory) {
      const amounts = [...cat.amounts.values()]
        .sort((a, b) => b.count - a.count || (a.lastDateKey < b.lastDateKey ? 1 : -1))
        .slice(0, MAX_AMOUNTS_PER_CATEGORY);
      entries[type].push({ categoryId, count: cat.count, amounts });
    }
  }

  return { v: BASELINE_VERSION, entries };
}

/** 'YYYY-MM-DD' 间隔天数(dateKey 在 today 之后按 0 算) */
function daysAgo(dateKey: string, today: string): number {
  const diff = (Date.parse(today) - Date.parse(dateKey)) / 86_400_000;
  return Math.max(0, diff);
}

/**
 * 对基线打分,返回「分类 id → 得分」,仅保留 ≥ CANDIDATE_MIN_SCORE 的候选,
 * 按得分降序插入(Map 迭代即有序)。子分类 id 也会出现在结果中。
 */
export function scoreCategories(
  baseline: Baseline,
  type: SuggestType,
  amountCents: number,
  today: string,
): Map<string, number> {
  const result = new Map<string, number>();
  if (amountCents <= 0) return result;

  const scored: { categoryId: string; score: number }[] = [];
  for (const entry of baseline.entries[type]) {
    let score = 0;
    for (const { cents, count, lastDateKey } of entry.amounts) {
      if (cents <= 0) continue;
      const kernel =
        cents === amountCents
          ? EXACT_BONUS
          : Math.exp(-((Math.log(cents / amountCents) ** 2) / (2 * SIGMA * SIGMA)));
      const recency = 0.5 ** (daysAgo(lastDateKey, today) / RECENCY_HALF_LIFE_DAYS);
      score += kernel * (1 + Math.log(count)) * recency;
    }
    if (score >= CANDIDATE_MIN_SCORE) scored.push({ categoryId: entry.categoryId, score });
  }

  scored.sort((a, b) => b.score - a.score);
  for (const { categoryId, score } of scored) result.set(categoryId, score);
  return result;
}

type ChildLike = { id: string };
type NodeLike = { id: string; children: ChildLike[] };

/** 有分的排前(按分降序,显式分区不依赖 sort 稳定性),其余保持原相对顺序 */
function partitionByScore<T extends { id: string }>(
  items: T[],
  scoreOf: (item: T) => number | undefined,
): T[] {
  const hit: { item: T; score: number; idx: number }[] = [];
  const rest: T[] = [];
  items.forEach((item, idx) => {
    const score = scoreOf(item);
    if (score !== undefined) hit.push({ item, score, idx });
    else rest.push(item);
  });
  hit.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return [...hit.map((h) => h.item), ...rest];
}

/**
 * 网格重排:父分类得分 = max(自身, 子分类最高分),命中候选按得分排前,
 * 其余保持原顺序;命中父分类的子数组同规则重排。返回新数组,不修改入参。
 */
export function orderTree<T extends NodeLike>(tree: T[], scores: ReadonlyMap<string, number>): T[] {
  if (scores.size === 0) return tree;

  const parentScore = (node: T): number | undefined => {
    let max: number | undefined = scores.get(node.id);
    for (const child of node.children) {
      const s = scores.get(child.id);
      if (s !== undefined && (max === undefined || s > max)) max = s;
    }
    return max;
  };

  return partitionByScore(tree, parentScore).map((node) => {
    if (parentScore(node) === undefined || node.children.length === 0) return node;
    return { ...node, children: partitionByScore(node.children, (c) => scores.get(c.id)) };
  });
}

/**
 * 自动预选:取树内得分最高且 ≥ AUTO_SELECT_MIN_SCORE 的分类。
 * 命中子分类 → expandParentId 为父 id;命中有子分类的父分类 → 为自身 id;否则 null。
 * scores 中已不在树里的 id(删除/归档/跨类型)自然被跳过。
 */
export function pickAutoSelect<T extends NodeLike>(
  tree: T[],
  scores: ReadonlyMap<string, number>,
): { categoryId: string; expandParentId: string | null } | null {
  let best: { categoryId: string; expandParentId: string | null; score: number } | null = null;

  const consider = (categoryId: string, expandParentId: string | null) => {
    const score = scores.get(categoryId);
    if (score === undefined) return;
    if (best === null || score > best.score) best = { categoryId, expandParentId, score };
  };

  for (const parent of tree) {
    consider(parent.id, parent.children.length > 0 ? parent.id : null);
    for (const child of parent.children) consider(child.id, parent.id);
  }

  if (best === null) return null;
  const { categoryId, expandParentId, score } = best;
  return score >= AUTO_SELECT_MIN_SCORE ? { categoryId, expandParentId } : null;
}

/** 基线是否需要重建:无存储 / 版本不符 / 交易签名变化 */
export function shouldRebuild(stored: StoredBaseline | null, sig: TxSignature): boolean {
  return (
    stored === null ||
    stored.baseline.v !== BASELINE_VERSION ||
    stored.meta.txCount !== sig.count ||
    stored.meta.maxUpdatedAt !== sig.maxUpdatedAt
  );
}
