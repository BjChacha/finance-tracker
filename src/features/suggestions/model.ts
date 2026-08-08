/**
 * Amount-based transaction suggestions.
 *
 * A baseline stores deduplicated amount statistics for categories, accounts,
 * and directed transfer account pairs. All target kinds share the same scoring
 * kernel so their confidence thresholds stay aligned.
 */

export const BASELINE_VERSION = 2;
export const BASELINE_WINDOW_DAYS = 183;
export const MAX_AMOUNTS_PER_TARGET = 40;
export const SIGMA = 0.18;
export const EXACT_BONUS = 3;
export const RECENCY_HALF_LIFE_DAYS = 45;
export const AUTO_SELECT_MIN_SCORE = 0.35;
export const CANDIDATE_MIN_SCORE = 0.15;

export type SuggestType = 'expense' | 'income';
export type SuggestTransactionType = SuggestType | 'transfer';

export type BaselineRow = {
  type: SuggestTransactionType;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  amount: number;
  dateKey: string;
};

export type AmountStat = { cents: number; count: number; lastDateKey: string };

type TargetStats = {
  count: number;
  amounts: AmountStat[];
};

export type BaselineEntry = TargetStats & {
  categoryId: string;
};

export type AccountBaselineEntry = TargetStats & {
  accountId: string;
};

export type TransferPairBaselineEntry = TargetStats & {
  accountId: string;
  toAccountId: string;
};

export type TransferPairScore = {
  accountId: string;
  toAccountId: string;
  score: number;
};

export type Baseline = {
  v: typeof BASELINE_VERSION;
  entries: Record<SuggestType, BaselineEntry[]>;
  accountEntries: Record<SuggestType, AccountBaselineEntry[]>;
  transferPairs: TransferPairBaselineEntry[];
};

export type TxSignature = { count: number; maxUpdatedAt: number };

export type StoredBaseline = {
  baseline: Baseline;
  meta: { builtAt: number; txCount: number; maxUpdatedAt: number };
};

type Aggregate<TTarget extends object> = {
  target: TTarget;
  count: number;
  amounts: Map<number, AmountStat>;
};

function addRow<TTarget extends object>(
  aggregates: Map<string, Aggregate<TTarget>>,
  key: string,
  target: TTarget,
  row: Pick<BaselineRow, 'amount' | 'dateKey'>,
): void {
  let aggregate = aggregates.get(key);
  if (!aggregate) {
    aggregate = { target, count: 0, amounts: new Map() };
    aggregates.set(key, aggregate);
  }

  aggregate.count += 1;
  const stat = aggregate.amounts.get(row.amount);
  if (!stat) {
    aggregate.amounts.set(row.amount, {
      cents: row.amount,
      count: 1,
      lastDateKey: row.dateKey,
    });
    return;
  }

  stat.count += 1;
  if (row.dateKey > stat.lastDateKey) stat.lastDateKey = row.dateKey;
}

function finalize<TTarget extends object>(
  aggregates: Map<string, Aggregate<TTarget>>,
): Array<TTarget & TargetStats> {
  return [...aggregates.values()].map((aggregate) => ({
    ...aggregate.target,
    count: aggregate.count,
    amounts: [...aggregate.amounts.values()]
      .sort((a, b) => b.count - a.count || (a.lastDateKey < b.lastDateKey ? 1 : -1))
      .slice(0, MAX_AMOUNTS_PER_TARGET),
  }));
}

export function buildBaseline(rows: BaselineRow[]): Baseline {
  const categoryAggregates: Record<SuggestType, Map<string, Aggregate<{ categoryId: string }>>> = {
    expense: new Map(),
    income: new Map(),
  };
  const accountAggregates: Record<SuggestType, Map<string, Aggregate<{ accountId: string }>>> = {
    expense: new Map(),
    income: new Map(),
  };
  const transferPairAggregates = new Map<
    string,
    Aggregate<{ accountId: string; toAccountId: string }>
  >();

  for (const row of rows) {
    if (row.type === 'transfer') {
      if (!row.toAccountId || row.toAccountId === row.accountId) continue;
      const pairKey = `${row.accountId}\u0000${row.toAccountId}`;
      addRow(
        transferPairAggregates,
        pairKey,
        { accountId: row.accountId, toAccountId: row.toAccountId },
        row,
      );
      continue;
    }

    addRow(accountAggregates[row.type], row.accountId, { accountId: row.accountId }, row);
    if (row.categoryId) {
      addRow(
        categoryAggregates[row.type],
        row.categoryId,
        { categoryId: row.categoryId },
        row,
      );
    }
  }

  return {
    v: BASELINE_VERSION,
    entries: {
      expense: finalize(categoryAggregates.expense),
      income: finalize(categoryAggregates.income),
    },
    accountEntries: {
      expense: finalize(accountAggregates.expense),
      income: finalize(accountAggregates.income),
    },
    transferPairs: finalize(transferPairAggregates),
  };
}

function daysAgo(dateKey: string, today: string): number {
  const diff = (Date.parse(today) - Date.parse(dateKey)) / 86_400_000;
  return Math.max(0, diff);
}

function scoreEntry(entry: TargetStats, amountCents: number, today: string): number {
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
  return score;
}

function scoreTargets<TEntry extends TargetStats>(
  entries: TEntry[],
  targetId: (entry: TEntry) => string,
  amountCents: number,
  today: string,
): Map<string, number> {
  const result = new Map<string, number>();
  if (amountCents <= 0) return result;

  const scored = entries
    .map((entry) => ({ id: targetId(entry), score: scoreEntry(entry, amountCents, today) }))
    .filter(({ score }) => score >= CANDIDATE_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  for (const { id, score } of scored) result.set(id, score);
  return result;
}

export function scoreCategories(
  baseline: Baseline,
  type: SuggestType,
  amountCents: number,
  today: string,
): Map<string, number> {
  return scoreTargets(baseline.entries[type], (entry) => entry.categoryId, amountCents, today);
}

export function scoreAccounts(
  baseline: Baseline,
  type: SuggestType,
  amountCents: number,
  today: string,
): Map<string, number> {
  return scoreTargets(
    baseline.accountEntries[type],
    (entry) => entry.accountId,
    amountCents,
    today,
  );
}

export function scoreTransferPairs(
  baseline: Baseline,
  amountCents: number,
  today: string,
): TransferPairScore[] {
  if (amountCents <= 0) return [];
  return baseline.transferPairs
    .map((entry) => ({
      accountId: entry.accountId,
      toAccountId: entry.toAccountId,
      score: scoreEntry(entry, amountCents, today),
    }))
    .filter(({ score }) => score >= CANDIDATE_MIN_SCORE)
    .sort((a, b) => b.score - a.score);
}

type ChildLike = { id: string };
type NodeLike = { id: string; children: ChildLike[] };

function partitionByScore<T extends { id: string }>(
  items: T[],
  scoreOf: (item: T) => number | undefined,
): T[] {
  const hit: { item: T; score: number; index: number }[] = [];
  const rest: T[] = [];
  items.forEach((item, index) => {
    const score = scoreOf(item);
    if (score !== undefined) hit.push({ item, score, index });
    else rest.push(item);
  });
  hit.sort((a, b) => b.score - a.score || a.index - b.index);
  return [...hit.map(({ item }) => item), ...rest];
}

export function orderByScore<T extends { id: string }>(
  items: T[],
  scores: ReadonlyMap<string, number>,
): T[] {
  if (scores.size === 0) return items;
  return partitionByScore(items, (item) => scores.get(item.id));
}

export function orderTree<T extends NodeLike>(
  tree: T[],
  scores: ReadonlyMap<string, number>,
): T[] {
  if (scores.size === 0) return tree;

  const parentScore = (node: T): number | undefined => {
    let max = scores.get(node.id);
    for (const child of node.children) {
      const score = scores.get(child.id);
      if (score !== undefined && (max === undefined || score > max)) max = score;
    }
    return max;
  };

  return partitionByScore(tree, parentScore).map((node) => {
    if (parentScore(node) === undefined || node.children.length === 0) return node;
    return { ...node, children: partitionByScore(node.children, (child) => scores.get(child.id)) };
  });
}

export function pickAutoSelectId<T extends { id: string }>(
  items: T[],
  scores: ReadonlyMap<string, number>,
): string | null {
  let bestId: string | null = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const score = scores.get(item.id);
    if (score !== undefined && score > bestScore) {
      bestId = item.id;
      bestScore = score;
    }
  }
  return bestScore >= AUTO_SELECT_MIN_SCORE ? bestId : null;
}

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

export function transferSourceScores(
  pairs: readonly TransferPairScore[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const pair of pairs) {
    const current = result.get(pair.accountId);
    if (current === undefined || pair.score > current) result.set(pair.accountId, pair.score);
  }
  return result;
}

export function transferDestinationScores(
  pairs: readonly TransferPairScore[],
  accountId: string | null,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!accountId) return result;
  for (const pair of pairs) {
    if (pair.accountId === accountId) result.set(pair.toAccountId, pair.score);
  }
  return result;
}

export function pickAutoSelectTransferPair(
  pairs: readonly TransferPairScore[],
  validAccountIds: ReadonlySet<string>,
): TransferPairScore | null {
  for (const pair of pairs) {
    if (pair.score < AUTO_SELECT_MIN_SCORE) return null;
    if (
      pair.accountId !== pair.toAccountId &&
      validAccountIds.has(pair.accountId) &&
      validAccountIds.has(pair.toAccountId)
    ) {
      return pair;
    }
  }
  return null;
}

export function shouldRebuild(stored: StoredBaseline | null, sig: TxSignature): boolean {
  return (
    stored === null ||
    stored.baseline.v !== BASELINE_VERSION ||
    stored.meta.txCount !== sig.count ||
    stored.meta.maxUpdatedAt !== sig.maxUpdatedAt
  );
}
