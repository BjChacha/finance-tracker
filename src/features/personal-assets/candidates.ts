import type { TxListItem } from '@/features/transactions/repository';
import { dayjs, todayKey } from '@/lib/date';
import { resolveAssetCategory } from './meta';
import type { AssetInput } from './repository';

/**
 * 「疑似资产消费」本地启发式打分（纯函数，离线、确定性）。
 *
 * 信号：
 * - 金额阶梯：大额支出更可能是资产购入；
 * - 交易类型：仅 expense（收入/转账永不入选）；
 * - 类别：资产类关键词加分，餐饮/交通/居住/医疗等日常消费减分；
 * - 备注：家电数码等资产名词加分，外卖打车等服务词减分；
 * - 周期记账产生的小额固定支出减分。
 *
 * 阈值与权重集中为常量，便于调整。
 */

export const CANDIDATE_DEFAULT_RANGE_DAYS = 90;
/** 「所有」时间窗哨兵：0 = 不限日期；其余档位为天数 */
export const ALL_TIME_RANGE_DAYS = 0;
export const CANDIDATE_RANGE_OPTIONS = [30, 90, 180, 365, ALL_TIME_RANGE_DAYS] as const;
export const CANDIDATE_MIN_SCORE = 40;
/** 单个时间窗视图最多展示的候选数 */
export const CANDIDATE_LIMIT = 30;
/**
 * 评分基底（全时间候选）最多持久保留的条数。
 * 各时间窗视图都从基底按日期过滤后切片，理论上极窄时间窗的 Top N 可能
 * 全局排名超出基底（如大量高分候选都落在窗外），个人账本规模下基本不会
 * 触发；超出部分本就远超「快速挑选」的浏览量。
 */
export const CANDIDATES_CACHE_MAX_ITEMS = 1000;
export const CANDIDATE_LARGE_AMOUNT_CENTS = 50_000;
export const CANDIDATE_MIN_RANGE_DAYS = 1;
export const CANDIDATE_MAX_RANGE_DAYS = 365;

/** 忽略记录存于 settings 表（JSON 数组，最多保留 IGNORED_CANDIDATE_LIMIT 条） */
export const IGNORED_CANDIDATE_SETTING_KEY = 'personalAssets.ignoredCandidateTxIds';
export const IGNORED_CANDIDATE_LIMIT = 500;

/** 评分基底的持久缓存（settings 表）：签名一致时冷启动零扫描 */
export const CANDIDATES_CACHE_SETTING_KEY = 'personalAssets.candidatesCache';
export const CANDIDATES_CACHE_VERSION = 1;

export type AssetCandidateReason = 'large' | 'category' | 'keyword';

export type AssetCandidateScore = {
  score: number;
  reasons: AssetCandidateReason[];
};

export type AssetCandidate = {
  transaction: TxListItem;
  score: number;
  reasons: AssetCandidateReason[];
};

/** 金额阶梯：命中最高一档（本位币分） */
const AMOUNT_TIERS: readonly { minCents: number; score: number }[] = [
  { minCents: 500_000, score: 50 },
  { minCents: 200_000, score: 40 },
  { minCents: 80_000, score: 30 },
  { minCents: 30_000, score: 20 },
  { minCents: 10_000, score: 10 },
];

const CATEGORY_BONUS = 25;
const CATEGORY_PENALTY = -35;
const NOTE_BONUS = 30;
const NOTE_SERVICE_BONUS = 15;
const NOTE_PENALTY = -35;
const RECURRING_PENALTY = -20;

const POSITIVE_CATEGORY_KEYWORDS: readonly string[] = [
  '数码', '电子', '家电', '家居', '家具', '服饰', '衣着',
  '珠宝', '首饰', '运动', '健身', '乐器', '音乐', '书籍',
  '图书', '游戏', '玩具', '课程', '收藏', '宠物',
];

const NEGATIVE_CATEGORY_KEYWORDS: readonly string[] = [
  '餐饮', '交通', '居住', '医疗', '人情', '理财', '补记漏记',
];

const POSITIVE_NOTE_KEYWORDS: readonly string[] = [
  '手机', '电脑', '平板', '耳机', '相机', '镜头', '显示器', '键盘', '鼠标', '主机', '显卡', '硬盘',
  '家电', '空调', '冰箱', '洗衣机', '电视', '微波炉', '烤箱', '电饭煲', '吸尘器', '加湿器', '风扇',
  '家具', '沙发', '衣柜', '书桌', '椅子', '床头', '灯具', '厨具', '锅具',
  '汽车', '自行车', '电动车', '摩托', '轮胎', '滑板车',
  '外套', '鞋子', '手表', '背包', '行李箱', '戒指', '项链', '手链', '耳环',
  '书籍', '图书', '吉他', '钢琴', '小提琴', '尤克里里',
  '手办', '模型', '卡牌', '潮玩', '黄金', '金条',
  '露营', '帐篷', '健身', '跑步机', '瑜伽', '自行车',
];

/** 订阅/买断型服务，资产化可能性中等 */
const SERVICE_NOTE_KEYWORDS: readonly string[] = [
  '会员', '年费', '买断', '终身', '订阅',
];

const NEGATIVE_NOTE_KEYWORDS: readonly string[] = [
  '外卖', '午餐', '晚餐', '早餐', '夜宵', '餐饮',
  '打车', '地铁', '公交', '加油', '充电', '停车', '洗车',
  '房租', '水电', '燃气', '物业', '话费', '流量', '宽带',
  '红包', '还款', '手续费', '利息', '退款', '捐赠',
  '药品', '挂号', '剪发', '美容', '理发',
];

function normalize(text: string | null | undefined): string {
  return (text ?? '').trim().toLowerCase();
}

function includesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

/** 时间窗天数归一化：0 = 所有；非法/越界回落默认 90 天（其余夹到 [1, 365]） */
export function normalizeCandidateRangeDays(rangeDays: number | null | undefined): number {
  if (typeof rangeDays !== 'number' || !Number.isFinite(rangeDays)) {
    return CANDIDATE_DEFAULT_RANGE_DAYS;
  }
  const days = Math.trunc(rangeDays);
  if (days === ALL_TIME_RANGE_DAYS) return ALL_TIME_RANGE_DAYS;
  if (days < CANDIDATE_MIN_RANGE_DAYS) return CANDIDATE_MIN_RANGE_DAYS;
  if (days > CANDIDATE_MAX_RANGE_DAYS) return CANDIDATE_MAX_RANGE_DAYS;
  return days;
}

/** 近 N 天（含今天）的日期闭区间；0 = 所有（起点取全零日期哨兵，恒成立） */
export function candidateRange(
  rangeDays: number,
  today = todayKey(),
): { start: string; end: string } {
  const days = normalizeCandidateRangeDays(rangeDays);
  if (days === ALL_TIME_RANGE_DAYS) return { start: '0000-01-01', end: today };
  return {
    start: dayjs(today).subtract(days - 1, 'day').format('YYYY-MM-DD'),
    end: today,
  };
}

/**
 * 单笔交易打分；非 expense 返回 null。
 * reasons 用于界面展示「为什么看起来像资产消费」。
 */
export function scoreAssetCandidate(tx: TxListItem): AssetCandidateScore | null {
  if (tx.type !== 'expense') return null;

  const reasons: AssetCandidateReason[] = [];
  let score = 0;

  const tier = AMOUNT_TIERS.find((item) => tx.amountBaseCents >= item.minCents);
  if (tier) score += tier.score;
  if (tx.amountBaseCents >= CANDIDATE_LARGE_AMOUNT_CENTS) reasons.push('large');

  const categoryText = normalize([tx.categoryName, tx.parentCategoryName].filter(Boolean).join(' '));
  if (categoryText) {
    if (includesAny(categoryText, POSITIVE_CATEGORY_KEYWORDS)) {
      score += CATEGORY_BONUS;
      reasons.push('category');
    }
    if (includesAny(categoryText, NEGATIVE_CATEGORY_KEYWORDS)) {
      score += CATEGORY_PENALTY;
    }
  }

  const noteText = normalize(tx.note);
  if (noteText) {
    if (includesAny(noteText, POSITIVE_NOTE_KEYWORDS)) {
      score += NOTE_BONUS;
      reasons.push('keyword');
    } else if (includesAny(noteText, SERVICE_NOTE_KEYWORDS)) {
      score += NOTE_SERVICE_BONUS;
      reasons.push('keyword');
    }
    if (includesAny(noteText, NEGATIVE_NOTE_KEYWORDS)) {
      score += NOTE_PENALTY;
    }
  }

  if (tx.recurringRuleId) score += RECURRING_PENALTY;

  return { score, reasons };
}

function toIdSet(value: ReadonlySet<string> | readonly string[] | undefined): ReadonlySet<string> {
  if (!value) return new Set<string>();
  if (value instanceof Set) return value;
  return new Set(value);
}

/**
 * 从交易列表中挑选候选：排除非支出、已生成过资产、用户已忽略的交易，
 * 按分数 → 金额 → 日期（新优先）排序并截断。
 */
export function pickAssetCandidates(
  transactions: readonly TxListItem[],
  options: {
    linkedTransactionIds?: ReadonlySet<string> | readonly string[];
    ignoredTransactionIds?: ReadonlySet<string> | readonly string[];
    minScore?: number;
    limit?: number;
  } = {},
): AssetCandidate[] {
  const linked = toIdSet(options.linkedTransactionIds);
  const ignored = toIdSet(options.ignoredTransactionIds);
  const minScore = options.minScore ?? CANDIDATE_MIN_SCORE;
  const limit = options.limit ?? CANDIDATE_LIMIT;

  const candidates: AssetCandidate[] = [];
  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    if (linked.has(transaction.id) || ignored.has(transaction.id)) continue;
    const scored = scoreAssetCandidate(transaction);
    if (scored === null || scored.score < minScore) continue;
    candidates.push({ transaction, score: scored.score, reasons: scored.reasons });
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      b.transaction.amountBaseCents - a.transaction.amountBaseCents ||
      (a.transaction.dateKey < b.transaction.dateKey ? 1 : a.transaction.dateKey > b.transaction.dateKey ? -1 : 0),
  );
  return candidates.slice(0, Math.max(1, limit));
}

/**
 * 从评分基底（全时间候选）切出某时间窗的视图。
 * 纯函数：切窗/换档/换排序只做内存操作，不触碰数据库 —— 这是
 * 「一次扫描、多窗复用」体验的关键。
 *
 * sort：
 * - 'score'   基底原序（分数 → 金额 → 日期），保持纯函数默认语义
 * - 'date-desc' 界面采用：dateKey 降序 → 分数 → 金额 → id，最新消费在前
 */
export function viewAssetCandidates(
  base: readonly AssetCandidate[],
  rangeDays: number,
  options: { limit?: number; today?: string; sort?: 'score' | 'date-desc' } = {},
): AssetCandidate[] {
  const days = normalizeCandidateRangeDays(rangeDays);
  const limit = options.limit ?? CANDIDATE_LIMIT;
  const bounded =
    days === ALL_TIME_RANGE_DAYS
      ? base
      : base.filter((candidate) => candidate.transaction.dateKey >= candidateRange(days, options.today).start);
  const sorted =
    options.sort === 'date-desc'
      ? [...bounded].sort(
          (a, b) =>
            (a.transaction.dateKey < b.transaction.dateKey ? 1 : a.transaction.dateKey > b.transaction.dateKey ? -1 : 0) ||
            b.score - a.score ||
            b.transaction.amountBaseCents - a.transaction.amountBaseCents ||
            (a.transaction.id < b.transaction.id ? -1 : 1),
        )
      : bounded;
  return sorted.slice(0, Math.max(1, limit));
}

/** 基底缓存签名：任一输入变化（交易/资产/忽略）都必须重建 */
export type CandidatesCacheSignature = {
  /** 支出交易行数（删除也会变） */
  txCount: number;
  /** 支出交易最大 updated_at（毫秒，0 表示无数据） */
  txMaxUpdatedAt: number;
  assetCount: number;
  assetMaxUpdatedAt: number;
  /** 忽略列表内容指纹（顺序无关） */
  ignoredKey: string;
};

export type StoredCandidatesCache = {
  v: typeof CANDIDATES_CACHE_VERSION;
  meta: CandidatesCacheSignature;
  savedAt: number;
  items: AssetCandidate[];
};

/** FNV-1a 指纹（对排序后的 id 列表），顺序无关、确定性 */
export function ignoredKeyOf(ids: readonly string[]): string {
  const sorted = [...ids].sort();
  let hash = 0x811c9dc5;
  for (const id of sorted) {
    for (let i = 0; i < id.length; i += 1) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0x2f;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${sorted.length}:${hash.toString(16)}`;
}

/** 基底是否需要重建：无缓存 / 版本变化 / 签名任一字段变化 */
export function shouldRebuildCandidatesCache(
  stored: StoredCandidatesCache | null,
  signature: CandidatesCacheSignature,
): boolean {
  if (stored === null) return true;
  if (stored.v !== CANDIDATES_CACHE_VERSION) return true;
  const a = stored.meta;
  const b = signature;
  return (
    a.txCount !== b.txCount ||
    a.txMaxUpdatedAt !== b.txMaxUpdatedAt ||
    a.assetCount !== b.assetCount ||
    a.assetMaxUpdatedAt !== b.assetMaxUpdatedAt ||
    a.ignoredKey !== b.ignoredKey
  );
}

/** 资产类别关键词（按声明顺序优先匹配） */
const ASSET_CATEGORY_KEYWORDS: ReadonlyArray<{ category: string; keywords: readonly string[] }> = [
  { category: 'electronics', keywords: ['数码', '电子', '手机', '电脑', '平板', '耳机', '相机', '镜头', '显示器', '键盘', '鼠标', '显卡', '硬盘', '主机'] },
  { category: 'appliance', keywords: ['家电', '空调', '冰箱', '洗衣机', '电视', '微波炉', '烤箱', '电饭煲', '吸尘器', '加湿器', '风扇'] },
  { category: 'home', keywords: ['家居', '家具', '沙发', '衣柜', '书桌', '椅子', '床', '灯具', '厨具', '锅具'] },
  { category: 'vehicle', keywords: ['汽车', '自行车', '电动车', '摩托', '轮胎', '滑板车'] },
  { category: 'clothing', keywords: ['服饰', '衣着', '外套', '鞋子', '背包', '行李箱', '帽子'] },
  { category: 'jewelry', keywords: ['珠宝', '首饰', '黄金', '金条', '戒指', '项链', '手链', '耳环', '手表'] },
  { category: 'sports', keywords: ['运动', '健身', '露营', '帐篷', '跑步机', '瑜伽'] },
  { category: 'books', keywords: ['书籍', '图书', '教材', '阅读'] },
  { category: 'music', keywords: ['乐器', '吉他', '钢琴', '小提琴', '尤克里里'] },
  { category: 'investment', keywords: ['投资', '收藏', '手办', '模型', '卡牌', '潮玩'] },
  { category: 'subscription', keywords: ['会员', '订阅', '年费', '服务'] },
  { category: 'digital', keywords: ['虚拟', '数字', '账号', '软件', '游戏'] },
];

function matchAssetCategory(text: string): string | null {
  if (!text) return null;
  for (const { category, keywords } of ASSET_CATEGORY_KEYWORDS) {
    if (includesAny(text, keywords)) return category;
  }
  return null;
}

/** 用交易分类名（含父分类）优先、备注次之，猜测资产类别；未命中归入「其他」 */
export function guessAssetCategory(tx: TxListItem): string {
  const categoryText = normalize([tx.categoryName, tx.parentCategoryName].filter(Boolean).join(' '));
  const byCategory = matchAssetCategory(categoryText);
  if (byCategory) return byCategory;
  return matchAssetCategory(normalize(tx.note)) ?? resolveAssetCategory(null).key;
}

/** 交易 → 资产草稿（批量生成与单条编辑共用同一口径） */
export function transactionToAssetInput(tx: TxListItem): AssetInput {
  const rawName = tx.note.trim() || tx.categoryName || '资产';
  const name = rawName.length > 40 ? rawName.slice(0, 40) : rawName;
  return {
    name,
    category: guessAssetCategory(tx),
    quantity: 1,
    costCents: tx.amountBaseCents,
    acquiredDateKey: tx.dateKey,
    note: '',
    sourceTransactionId: tx.id,
  };
}

/** 追加忽略 id（去重、新 id 置于末尾、超限裁掉最旧的） */
export function mergeIgnoredCandidateIds(
  existing: readonly string[],
  addedId: string,
  limit = IGNORED_CANDIDATE_LIMIT,
): string[] {
  const next = existing.filter((id) => id !== addedId);
  next.push(addedId);
  return next.slice(-limit);
}
