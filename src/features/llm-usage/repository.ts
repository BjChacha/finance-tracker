import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { llmUsage, transactions, type LLMUsageSource } from "@/db/schema";
import { newId } from "@/lib/id";
import { SMART_TAG } from "@/features/transactions/tags";
import { costMicros, priceTierAt, type TokenUsage } from "./pricing";

export type LLMUsageTotals = {
  calls: number;
  costMicros: number;
  promptTokens: number;
  completionTokens: number;
};

export type LLMUsageSummary = {
  month: LLMUsageTotals;
  total: LLMUsageTotals;
};

/**
 * 「智能识别」统计：识别生成过多少笔交易、全部交易有多少笔（占比由界面算），
 * 以及识别调用本身的花费。报告生成的调用（source='report'）不计入。
 */
export type SmartRecognitionSummary = LLMUsageSummary & {
  /** 带「智能」标签的交易数 */
  generated: number;
  /** 全部交易数（占比分母） */
  transactions: number;
};

/**
 * Persists one billed call. The cost is computed once and stored, so a later price change never
 * rewrites what the user already spent. `source` keeps recognition and report spend apart.
 */
export async function recordLLMUsage(
  source: LLMUsageSource,
  model: string,
  usage: TokenUsage,
  at = new Date(),
): Promise<void> {
  await db.insert(llmUsage).values({
    id: newId(),
    createdAt: at.getTime(),
    source,
    model,
    promptTokens: usage.promptTokens,
    cacheHitTokens: usage.cacheHitTokens,
    cacheMissTokens: usage.cacheMissTokens,
    completionTokens: usage.completionTokens,
    costMicros: costMicros(model, usage, at),
    priceTier: priceTierAt(at),
  });
}

/**
 * Month boundaries follow the device zone, matching how the rest of the app reports "本月".
 * Only recognition calls are aggregated: report generation is a separate, explicit action.
 */
async function recognitionUsageSummary(monthStart: number): Promise<LLMUsageSummary> {
  const [row] = await db
    .select({
      totalCalls: sql<number>`COUNT(*)`,
      totalCost: sql<number>`COALESCE(SUM(${llmUsage.costMicros}), 0)`,
      totalPrompt: sql<number>`COALESCE(SUM(${llmUsage.promptTokens}), 0)`,
      totalCompletion: sql<number>`COALESCE(SUM(${llmUsage.completionTokens}), 0)`,
      monthCalls: sql<number>`COALESCE(SUM(CASE WHEN ${llmUsage.createdAt} >= ${monthStart} THEN 1 ELSE 0 END), 0)`,
      monthCost: sql<number>`COALESCE(SUM(CASE WHEN ${llmUsage.createdAt} >= ${monthStart} THEN ${llmUsage.costMicros} ELSE 0 END), 0)`,
      monthPrompt: sql<number>`COALESCE(SUM(CASE WHEN ${llmUsage.createdAt} >= ${monthStart} THEN ${llmUsage.promptTokens} ELSE 0 END), 0)`,
      monthCompletion: sql<number>`COALESCE(SUM(CASE WHEN ${llmUsage.createdAt} >= ${monthStart} THEN ${llmUsage.completionTokens} ELSE 0 END), 0)`,
    })
    .from(llmUsage)
    .where(eq(llmUsage.source, "nl"));
  return {
    month: {
      calls: Number(row?.monthCalls ?? 0),
      costMicros: Number(row?.monthCost ?? 0),
      promptTokens: Number(row?.monthPrompt ?? 0),
      completionTokens: Number(row?.monthCompletion ?? 0),
    },
    total: {
      calls: Number(row?.totalCalls ?? 0),
      costMicros: Number(row?.totalCost ?? 0),
      promptTokens: Number(row?.totalPrompt ?? 0),
      completionTokens: Number(row?.totalCompletion ?? 0),
    },
  };
}

/**
 * 识别生成的交易数 / 全部交易数，一次查询取回。
 * `tags` 存的是 JSON 数组文本（`["智能"]`），故按 `"智能"` 精确匹配即可命中标签
 * ——标签本身不超过两个字，不会出现「包含该片段的更长的标签」。
 */
async function smartTagStats(): Promise<{ generated: number; transactions: number }> {
  const pattern = `%"${SMART_TAG}"%`;
  const [row] = await db
    .select({
      transactions: count(),
      generated: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.tags} LIKE ${pattern} THEN 1 ELSE 0 END), 0)`.mapWith(
        Number,
      ),
    })
    .from(transactions);
  return {
    generated: Number(row?.generated ?? 0),
    transactions: Number(row?.transactions ?? 0),
  };
}

/** 个人页「智能识别」卡片的全部数据（识别花费 + 识别生成的交易占比） */
export async function smartRecognitionSummary(
  now = new Date(),
): Promise<SmartRecognitionSummary> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const [usage, stats] = await Promise.all([
    recognitionUsageSummary(monthStart),
    smartTagStats(),
  ]);
  return { ...usage, ...stats };
}
