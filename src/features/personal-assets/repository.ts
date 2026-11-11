import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  categories,
  personalAssets,
  recurringRules,
  transactions,
  type PersonalAsset,
} from '@/db/schema';
import { getSetting, setSetting } from '@/db/settings';
import { createRule, toggleRule } from '@/features/recurring/repository';
import { catchUp } from '@/features/recurring/service';
import { createTransaction, getTransactionById, listTransactions } from '@/features/transactions/repository';
import { dayjs, todayKey } from '@/lib/date';
import { newId } from '@/lib/id';
import {
  CANDIDATES_CACHE_MAX_ITEMS,
  CANDIDATES_CACHE_SETTING_KEY,
  CANDIDATES_CACHE_VERSION,
  IGNORED_CANDIDATE_SETTING_KEY,
  ignoredKeyOf,
  mergeIgnoredCandidateIds,
  pickAssetCandidates,
  shouldRebuildCandidatesCache,
  type AssetCandidate,
  type CandidatesCacheSignature,
  type StoredCandidatesCache,
} from './candidates';
import {
  buildInstallmentPlan,
  buildInstallmentRuleInput,
  validateInstallmentInput,
  type InstallmentPlanInput,
} from './installment';
import { isAssetCategoryKey, resolveAssetCategory } from './meta';

/**
 * 个人资产仓储：CRUD + 全生命周期操作（出售 / 处置 / 恢复 / 分期结清）。
 * 生命周期不变式：
 * - 资产只记录取得成本，不做估值；\r?\n * - 出售/处置记录 closedDateKey，出售额外记录 soldCents；
 * - 恢复持有清空 closedDateKey/soldCents，估值历史原样保留。
 */

export type AssetInput = {
  name: string;
  category: string;
  quantity: number;
  /** 取得成本（本位币分） */
  costCents: number;
  /** 'YYYY-MM-DD' */
  acquiredDateKey: string;
  note: string;
  /** 来源支出交易 id（可空） */
  sourceTransactionId: string | null;
};

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 与交易表单同口径：正则 + dayjs 合法 + format 往返一致（拦住 2026-02-30 溢出） */
function isValidDateKey(dateKey: string): boolean {
  if (!DATE_KEY_RE.test(dateKey)) return false;
  const d = dayjs(dateKey, 'YYYY-MM-DD');
  return d.isValid() && d.format('YYYY-MM-DD') === dateKey;
}

/** 表单/入参校验（纯函数）：返回中文错误文案，通过返回 null */
export function validateAssetInput(input: AssetInput): string | null {
  if (!input.name.trim()) return '请输入资产名称';
  if (!isAssetCategoryKey(input.category)) return '请选择资产类别';
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) return '数量必须为不小于 1 的整数';
  if (!Number.isSafeInteger(input.costCents) || input.costCents < 0) return '取得成本格式不正确';
  if (!isValidDateKey(input.acquiredDateKey)) {
    return '取得日期格式不正确（YYYY-MM-DD）';
  }
  return null;
}

/** 全部资产，取得日期新 → 旧 */
export async function listAssets(): Promise<PersonalAsset[]> {
  return db
    .select()
    .from(personalAssets)
    .orderBy(desc(personalAssets.acquiredDateKey), desc(personalAssets.createdAt));
}

export async function getAssetById(id: string): Promise<PersonalAsset | null> {
  const [row] = await db.select().from(personalAssets).where(eq(personalAssets.id, id)).limit(1);
  return row ?? null;
}

/** 某笔支出已生成的资产（「生成资产」入口的重复提示用） */
export async function findAssetsBySourceTransaction(transactionId: string): Promise<PersonalAsset[]> {
  return db
    .select()
    .from(personalAssets)
    .where(eq(personalAssets.sourceTransactionId, transactionId))
    .orderBy(desc(personalAssets.createdAt));
}

function toRowValues(input: AssetInput) {
  const def = resolveAssetCategory(input.category);
  return {
    name: input.name.trim(),
    category: def.key,
    icon: def.icon,
    color: def.color,
    quantity: input.quantity,
    costCents: input.costCents,
    acquiredDateKey: input.acquiredDateKey,
    note: input.note.trim(),
    sourceTransactionId: input.sourceTransactionId,
  };
}

export async function createAsset(input: AssetInput): Promise<string> {
  const error = validateAssetInput(input);
  if (error) throw new Error(error);
  const id = newId();
  const now = Date.now();
  await db.transaction(async () => {
    await insertAssetRow(id, input, now);
  });
  return id;
}

export type InstallmentAssetInput = {
  asset: AssetInput;
  plan: InstallmentPlanInput;
  /** 首期还款日（必须晚于取得日期） */
  firstDueDateKey: string;
  /** 还款账户（首付与各期次交易） */
  accountId: string;
  /** 支出分类（首付与各期次交易） */
  categoryId: string;
  /** true=自动入账 false=待确认 */
  autoCreate: boolean;
};

/**
 * 创建分期资产（单事务）：
 * 1) 写资产行 + 成本基线估值（成本/市值均为总价，全额口径）；
 * 2) 首付 > 0 → 生成支出交易 `首付：{名称}` 并回填其 id；
 * 3) 创建月度周期记账规则（期次生成引擎）并回填 ruleId；
 * 4) 提交后 autoCreate 时立即 catchUp 补生成已到期期次（失败不阻断）。
 */
export async function createInstallmentAsset(input: InstallmentAssetInput): Promise<string> {
  const assetError = validateAssetInput(input.asset);
  if (assetError) throw new Error(assetError);
  const installmentError = validateInstallmentInput(input.plan, {
    acquiredDateKey: input.asset.acquiredDateKey,
    firstDueDateKey: input.firstDueDateKey,
  });
  if (installmentError) throw new Error(installmentError);
  if (!input.accountId) throw new Error('请选择还款账户');
  if (!input.categoryId) throw new Error('请选择支出分类');

  const plan = buildInstallmentPlan(input.plan, input.firstDueDateKey);
  const id = newId();
  const now = Date.now();
  let downPaymentTransactionId: string | null = null;
  let ruleId: string;

  await db.transaction(async () => {
    await insertAssetRow(id, input.asset, now, {
      installmentPeriods: input.plan.periods,
      installmentDownPaymentCents: input.plan.downPaymentCents ?? 0,
      installmentInterestCents: plan.totalInterestCents,
      installmentAnnualRateScaled:
        input.plan.interestMode === 'annual-rate' ? (input.plan.annualRateScaled ?? 0) : null,
      installmentFirstDueDateKey: input.firstDueDateKey,
      installmentAccountId: input.accountId,
      installmentCategoryId: input.categoryId,
      installmentAutoCreate: input.autoCreate ? 1 : 0,
    });
    if (plan.principalCents < input.asset.costCents) {
      // 首付 > 0：立即记一笔真实支出
      downPaymentTransactionId = await createTransaction({
        type: 'expense',
        amount: input.plan.downPaymentCents ?? 0,
        accountId: input.accountId,
        categoryId: input.categoryId,
        date: dayjs(`${input.asset.acquiredDateKey} 12:00`).valueOf(),
        note: `首付：${input.asset.name.trim()}`,
      });
    }
    ruleId = await createRule(
      buildInstallmentRuleInput(input.asset.name.trim(), plan, {
        accountId: input.accountId,
        categoryId: input.categoryId,
        autoCreate: input.autoCreate,
      }),
    );
    await db
      .update(personalAssets)
      .set({ installmentRuleId: ruleId, installmentDownPaymentTransactionId: downPaymentTransactionId, updatedAt: now })
      .where(eq(personalAssets.id, id));
  });

  // 已到期的期次立即补生成（幂等；失败交给下次启动的 catchUp）
  if (input.autoCreate) {
    try {
      await catchUp();
    } catch (e) {
      console.warn('[personal-assets] installment catchUp failed:', e);
    }
  }
  return id;
}

/**
 * 提前结清分期：停用关联周期规则（剩余期次不再生成），记录结清日；
 * 已生成的历史交易保留。规则已被删除时仅记录结清日。
 */
export async function settleInstallment(assetId: string): Promise<void> {
  const asset = await getAssetById(assetId);
  if (!asset) throw new Error('资产不存在');
  if (asset.installmentPeriods <= 0) throw new Error('该资产不是分期资产');
  if (asset.installmentClosedDateKey) throw new Error('分期已结清');
  if (asset.installmentRuleId) {
    await toggleRule(asset.installmentRuleId, false);
  }
  await db
    .update(personalAssets)
    .set({ installmentClosedDateKey: todayKey(), updatedAt: Date.now() })
    .where(eq(personalAssets.id, assetId));
}

/** 关联规则已生成的期次交易数（分期进度用；规则不存在时由调用方回退日期推算） */
export async function countInstallmentPeriods(ruleId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(transactions)
    .where(and(eq(transactions.recurringRuleId, ruleId), eq(transactions.type, 'expense')));
  return row?.n ?? 0;
}

/** 分期中（未结清）资产禁止出售/处置 */
function assertNotInstallmentActive(asset: PersonalAsset): void {
  if (asset.installmentPeriods > 0 && !asset.installmentClosedDateKey) {
    throw new Error('该资产分期尚未结清，请先「提前结清分期」再出售/处置');
  }
}

/** 批量生成资产（单事务，任一失败整体回滚）；返回新资产 id 列表 */
export async function createAssetsBatch(inputs: AssetInput[]): Promise<string[]> {
  if (inputs.length === 0) return [];
  for (const input of inputs) {
    const error = validateAssetInput(input);
    if (error) throw new Error(error);
  }
  const now = Date.now();
  const ids: string[] = [];
  await db.transaction(async () => {
    for (const [index, input] of inputs.entries()) {
      const id = newId();
      ids.push(id);
      await insertAssetRow(id, input, now + index);
    }
  });
  return ids;
}

/** 写入一条资产（调用方负责事务与校验） */
async function insertAssetRow(
  id: string,
  input: AssetInput,
  now: number,
  extra?: Partial<typeof personalAssets.$inferInsert>,
): Promise<void> {
  await db.insert(personalAssets).values({
    id,
    ...toRowValues(input),
    status: 'holding',
    closedDateKey: null,
    soldCents: null,
    ...extra,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateAsset(id: string, input: AssetInput): Promise<void> {
  const error = validateAssetInput(input);
  if (error) throw new Error(error);
  await db
    .update(personalAssets)
    .set({ ...toRowValues(input), updatedAt: Date.now() })
    .where(eq(personalAssets.id, id));
}

/* ------------------------------ 出售双模式 ------------------------------ */

/** 解析预置收入分类「二手闲置」（种子幂等保证存在；缺失时报错提示） */
async function resolveSaleIncomeCategoryId(): Promise<string> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.type, 'income'), eq(categories.name, '二手闲置')))
    .limit(1);
  if (!row) throw new Error('未找到「二手闲置」收入分类，请先在分类管理中确认该预置分类存在');
  return row.id;
}

/**
 * 手动出售 + 可选自动记账：
 * 单事务内完成——资产置 sold；recordIncome 时生成一笔收入交易
 * （CNY、分类「二手闲置」、备注 `出售：{资产名}`）并回写 soldTransactionId。
 */
export async function sellAssetManual(options: {
  assetId: string;
  soldCents: number;
  dateKey: string;
  recordIncome: boolean;
  /** recordIncome 时必填：收入入账账户 */
  accountId?: string;
}): Promise<{ incomeTransactionId: string | null }> {
  const { assetId, soldCents, dateKey, recordIncome, accountId } = options;
  const asset = await getAssetById(assetId);
  if (!asset) throw new Error('资产不存在');
  if (asset.status !== 'holding') throw new Error('该资产已出售或处置');
  assertNotInstallmentActive(asset);
  if (!Number.isSafeInteger(soldCents) || soldCents <= 0) throw new Error('出售所得必须为正数');
  if (!isValidDateKey(dateKey)) {
    throw new Error('出售日期格式不正确（YYYY-MM-DD）');
  }
  if (recordIncome && !accountId) throw new Error('请选择收入入账账户');

  const categoryId = recordIncome ? await resolveSaleIncomeCategoryId() : null;
  const now = Date.now();
  let incomeTransactionId: string | null = null;

  await db.transaction(async () => {
    if (recordIncome && categoryId && accountId) {
      incomeTransactionId = await createTransaction({
        type: 'income',
        amount: soldCents,
        accountId,
        categoryId,
        date: dayjs(`${dateKey} 12:00`).valueOf(),
        note: `出售：${asset.name}`,
      });
    }
    await db
      .update(personalAssets)
      .set({
        status: 'sold',
        soldCents,
        closedDateKey: dateKey,
        soldTransactionId: incomeTransactionId,
        updatedAt: now,
      })
      .where(eq(personalAssets.id, assetId));
  });
  return { incomeTransactionId };
}

/** 关联出售：把一笔既有收入交易作为该资产的出售记录 */
export async function sellAssetByTransaction(options: {
  assetId: string;
  transactionId: string;
}): Promise<void> {
  const { assetId, transactionId } = options;
  const asset = await getAssetById(assetId);
  if (!asset) throw new Error('资产不存在');
  if (asset.status !== 'holding') throw new Error('该资产已出售或处置');
  assertNotInstallmentActive(asset);

  const tx = await getTransactionById(transactionId);
  if (!tx) throw new Error('未找到该收入交易');
  if (tx.type !== 'income') throw new Error('只能关联收入类型的交易');

  const [occupied] = await db
    .select({ id: personalAssets.id })
    .from(personalAssets)
    .where(eq(personalAssets.soldTransactionId, transactionId))
    .limit(1);
  if (occupied) throw new Error('该收入已关联其他资产的出售记录');

  await db
    .update(personalAssets)
    .set({
      status: 'sold',
      soldCents: tx.amountBaseCents,
      closedDateKey: tx.dateKey,
      soldTransactionId: transactionId,
      updatedAt: Date.now(),
    })
    .where(eq(personalAssets.id, assetId));
}

/** 关联列表关键词过滤（纯函数：备注/分类/父分类/账户名，trim + 大小写不敏感） */
export function filterIncomeByKeyword<
  T extends { note: string | null; categoryName: string | null; parentCategoryName?: string | null; accountName: string | null },
>(items: readonly T[], keyword: string): T[] {
  const query = keyword.trim().toLowerCase();
  if (!query) return [...items];
  return items.filter((item) =>
    [item.note, item.categoryName, item.parentCategoryName, item.accountName]
      .filter((value): value is string => typeof value === 'string')
      .some((value) => value.toLowerCase().includes(query)),
  );
}


/** 处置（送人/丢弃/报废）：所得记 0，status → disposed */
export async function disposeAsset(assetId: string, dateKey: string): Promise<void> {
  const asset = await getAssetById(assetId);
  if (!asset) throw new Error('资产不存在');
  if (asset.status !== 'holding') throw new Error('该资产已出售或处置');
  assertNotInstallmentActive(asset);
  if (!isValidDateKey(dateKey)) {
    throw new Error('处置日期格式不正确（YYYY-MM-DD）');
  }
  await db
    .update(personalAssets)
    .set({ status: 'disposed', soldCents: null, closedDateKey: dateKey, updatedAt: Date.now() })
    .where(eq(personalAssets.id, assetId));
}

/** 恢复持有：清空退出信息与出售收入关联，估值历史保留（已生成的收入交易不删） */
export async function reactivateAsset(assetId: string): Promise<void> {
  await db
    .update(personalAssets)
    .set({
      status: 'holding',
      soldCents: null,
      closedDateKey: null,
      soldTransactionId: null,
      updatedAt: Date.now(),
    })
    .where(eq(personalAssets.id, assetId));
}

/** 删除资产及其估值历史；若有分期规则则一并删除（历史交易保留、清除回链） */
export async function deleteAsset(assetId: string): Promise<void> {
  const [asset] = await db
    .select({ installmentRuleId: personalAssets.installmentRuleId })
    .from(personalAssets)
    .where(eq(personalAssets.id, assetId))
    .limit(1);
  await db.transaction(async () => {
    const ruleId = asset?.installmentRuleId ?? null;
    if (ruleId) {
      await db
        .update(transactions)
        .set({ recurringRuleId: null })
        .where(eq(transactions.recurringRuleId, ruleId));
      await db.delete(recurringRules).where(eq(recurringRules.id, ruleId));
    }
    await db.delete(personalAssets).where(eq(personalAssets.id, assetId));
  });
}

/* ------------------------------ 资产候选（智能发现） ------------------------------ */

/** 已生成过资产的来源交易 id（资产候选需排除，避免重复生成） */
export async function listLinkedSourceTransactionIds(): Promise<string[]> {
  const rows = await db
    .select({ sourceTransactionId: personalAssets.sourceTransactionId })
    .from(personalAssets);
  return rows
    .map((row) => row.sourceTransactionId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** 用户忽略过的候选交易 id（settings JSON 数组；解析失败视为空） */
export async function getIgnoredCandidateTransactionIds(): Promise<string[]> {
  const stored = await getSetting<unknown>(IGNORED_CANDIDATE_SETTING_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** 忽略一笔候选（持久化到 settings，最多保留 500 条） */
export async function ignoreCandidateTransaction(transactionId: string): Promise<void> {
  const existing = await getIgnoredCandidateTransactionIds();
  await setSetting(
    IGNORED_CANDIDATE_SETTING_KEY,
    mergeIgnoredCandidateIds(existing, transactionId),
  );
}

/**
 * 评分基底：全时间候选（按分数降序），一次扫描覆盖所有时间窗视图。
 *
 * 性能约定：
 * - 持久缓存存于 settings（CANDIDATES_CACHE_SETTING_KEY），签名一致时直接复用，
 *   冷启动/无变更时零扫描（与 features/suggestions 的 baseline 同一套思路）；
 * - 签名 = 支出行数/最大 updated_at + 资产行数/最大 updated_at + 忽略列表指纹，
 *   任一变化（含删除）都会触发重建；内存侧由 react-query 失效机制驱动重取。
 */
export async function loadCandidateBase(): Promise<AssetCandidate[]> {
  const [txStats, assetStats, ignoredIds] = await Promise.all([
    expenseTableStats(),
    assetTableStats(),
    getIgnoredCandidateTransactionIds(),
  ]);
  const signature: CandidatesCacheSignature = {
    txCount: txStats.count,
    txMaxUpdatedAt: txStats.maxUpdatedAt,
    assetCount: assetStats.count,
    assetMaxUpdatedAt: assetStats.maxUpdatedAt,
    ignoredKey: ignoredKeyOf(ignoredIds),
  };

  const stored = await readCandidatesCache();
  if (stored !== null && !shouldRebuildCandidatesCache(stored, signature)) {
    return stored.items;
  }

  const [transactions, linkedIds] = await Promise.all([
    listTransactions({ type: 'expense' }),
    listLinkedSourceTransactionIds(),
  ]);
  const items = pickAssetCandidates(transactions, {
    linkedTransactionIds: linkedIds,
    ignoredTransactionIds: ignoredIds,
    limit: CANDIDATES_CACHE_MAX_ITEMS,
  });
  // 缓存写失败不影响本次结果（下次最多多扫一次）
  await setSetting(CANDIDATES_CACHE_SETTING_KEY, {
    v: CANDIDATES_CACHE_VERSION,
    meta: signature,
    savedAt: Date.now(),
    items,
  } satisfies StoredCandidatesCache).catch(() => {});
  return items;
}

async function expenseTableStats(): Promise<{ count: number; maxUpdatedAt: number }> {
  const [row] = await db
    .select({
      count: sql<number>`COUNT(*)`.mapWith(Number),
      maxUpdatedAt: sql<number>`COALESCE(MAX(${transactions.updatedAt}), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(eq(transactions.type, 'expense'));
  return row ?? { count: 0, maxUpdatedAt: 0 };
}

async function assetTableStats(): Promise<{ count: number; maxUpdatedAt: number }> {
  const [row] = await db
    .select({
      count: sql<number>`COUNT(*)`.mapWith(Number),
      maxUpdatedAt: sql<number>`COALESCE(MAX(${personalAssets.updatedAt}), 0)`.mapWith(Number),
    })
    .from(personalAssets);
  return row ?? { count: 0, maxUpdatedAt: 0 };
}

async function readCandidatesCache(): Promise<StoredCandidatesCache | null> {
  const stored = await getSetting<unknown>(CANDIDATES_CACHE_SETTING_KEY);
  if (stored === null || typeof stored !== 'object') return null;
  const cache = stored as Partial<StoredCandidatesCache>;
  if (
    cache.v !== CANDIDATES_CACHE_VERSION ||
    !Array.isArray(cache.items) ||
    cache.items.every((item) => typeof item === 'object' && item !== null) === false ||
    typeof cache.meta?.txCount !== 'number'
  ) {
    return null;
  }
  return cache as StoredCandidatesCache;
}

