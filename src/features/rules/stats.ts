import { getSetting, setSetting } from '@/db/settings';

/**
 * 分类建议/识别的本地命中统计（Sure「影子对比」的本地等价物）：
 * 记录建议出现过多少次、用户保留了多少次，为将来调 AUTO_SELECT_MIN_SCORE
 * 阈值与 NL 提示词留数据。纯计数，不存任何交易内容。
 */
export type CategoryStats = {
  /** 统计建议自动选中的分类被用户保留的次数 / 出现总次数 */
  suggestionAccepted: number;
  suggestionTotal: number;
  /** 一句话记账识别的分类被保留次数 / 提供总次数 */
  nlAccepted: number;
  nlTotal: number;
};

const KEY = 'category.stats';

const EMPTY: CategoryStats = {
  suggestionAccepted: 0,
  suggestionTotal: 0,
  nlAccepted: 0,
  nlTotal: 0,
};

export async function getCategoryStats(): Promise<CategoryStats> {
  const stored = await getSetting<Partial<CategoryStats>>(KEY);
  return { ...EMPTY, ...stored };
}

/** 一次保存交易后的结果上报（fire-and-forget，调用方不必 await） */
export async function recordCategoryOutcome(outcome: {
  /** 本次保存中统计建议曾自动选中分类 */
  suggestionOffered: boolean;
  /** 最终分类来源是统计建议 */
  suggestionAccepted: boolean;
  /** 本次保存来自一句话记账且模型给了分类 */
  nlOffered: boolean;
  /** 最终分类保留了模型给的分类 */
  nlAccepted: boolean;
}): Promise<void> {
  const current = await getCategoryStats();
  await setSetting(KEY, {
    suggestionAccepted:
      current.suggestionAccepted + (outcome.suggestionAccepted ? 1 : 0),
    suggestionTotal: current.suggestionTotal + (outcome.suggestionOffered ? 1 : 0),
    nlAccepted: current.nlAccepted + (outcome.nlAccepted ? 1 : 0),
    nlTotal: current.nlTotal + (outcome.nlOffered ? 1 : 0),
  });
}

/** 命中率（0-1）；分母为 0 返回 null（尚无数据） */
export function hitRate(stats: CategoryStats, kind: 'suggestion' | 'nl'): number | null {
  const total = kind === 'suggestion' ? stats.suggestionTotal : stats.nlTotal;
  const accepted = kind === 'suggestion' ? stats.suggestionAccepted : stats.nlAccepted;
  return total > 0 ? accepted / total : null;
}
