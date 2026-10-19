import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { llmUsage } from "@/db/schema";
import { newId } from "@/lib/id";
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
 * Persists one billed call. The cost is computed once and stored, so a later price change never
 * rewrites what the user already spent.
 */
export async function recordLLMUsage(
  model: string,
  usage: TokenUsage,
  at = new Date(),
): Promise<void> {
  await db.insert(llmUsage).values({
    id: newId(),
    createdAt: at.getTime(),
    model,
    promptTokens: usage.promptTokens,
    cacheHitTokens: usage.cacheHitTokens,
    cacheMissTokens: usage.cacheMissTokens,
    completionTokens: usage.completionTokens,
    costMicros: costMicros(model, usage, at),
    priceTier: priceTierAt(at),
  });
}

/** Month boundaries follow the device zone, matching how the rest of the app reports "本月". */
export async function llmUsageSummary(now = new Date()): Promise<LLMUsageSummary> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
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
    .from(llmUsage);
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
