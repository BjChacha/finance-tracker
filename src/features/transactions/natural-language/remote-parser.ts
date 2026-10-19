import { recordLLMUsage, type TokenUsage } from "@/features/llm-usage";
import { DEEPSEEK_SETTINGS, createDeepSeekTransport } from "./deepseek";
import { createNaturalLanguageParser } from "./parser";

/** Fire-and-forget: a failed billing insert must never fail the recognition itself. */
function reportUsage(model: string, usage: TokenUsage) {
  void recordLLMUsage(model, usage).catch((error) => {
    console.warn("[llm-usage] Failed to record usage", error);
  });
}

/** Bound once per process; the transport holds no session state. */
export const parseTransactionText = createNaturalLanguageParser(
  createDeepSeekTransport(DEEPSEEK_SETTINGS, fetch, reportUsage),
  DEEPSEEK_SETTINGS.model,
);
