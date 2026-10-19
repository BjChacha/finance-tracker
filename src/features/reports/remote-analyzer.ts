import { recordLLMUsage } from "@/features/llm-usage";
import { costMicros, type TokenUsage } from "@/features/llm-usage/pricing";
import { createDeepSeekTransport, DEEPSEEK_SETTINGS } from "@/features/transactions/natural-language/deepseek";
import { createReportAnalyzer } from "./analyzer";
import type { ReportAnalysis } from "./analysis-contract";
import type { ReportAnalysisInput } from "./llm-payload";

/**
 * Analysis output is far longer than field extraction, so it needs a larger budget than the
 * recognition transport. Everything else (endpoint, key, model) comes from the same settings.
 */
export const REPORT_SETTINGS = {
  ...DEEPSEEK_SETTINGS,
  timeoutMs: 60_000,
};

export type GeneratedAnalysis = {
  analysis: ReportAnalysis;
  model: string;
  costMicros: number;
  generatedAt: number;
};

/**
 * Runs one analysis call and captures its token usage. The transport is created per call so the
 * usage sink writes into this call's own holder instead of shared mutable state.
 */
export async function analyzeReportRemotely(
  input: ReportAnalysisInput,
  options: { signal?: AbortSignal } = {},
): Promise<GeneratedAnalysis> {
  const at = new Date();
  const captured: { usage: TokenUsage | null } = { usage: null };
  const transport = createDeepSeekTransport(REPORT_SETTINGS, fetch, (model, usage) => {
    captured.usage = usage;
    void recordLLMUsage(model, usage, at).catch((error) => {
      console.warn("[llm-usage] Failed to record usage", error);
    });
  });
  const analysis = await createReportAnalyzer(transport, REPORT_SETTINGS.model)(
    input,
    options,
  );
  return {
    analysis,
    model: REPORT_SETTINGS.model,
    costMicros: captured.usage
      ? costMicros(REPORT_SETTINGS.model, captured.usage, at)
      : 0,
    generatedAt: at.getTime(),
  };
}
