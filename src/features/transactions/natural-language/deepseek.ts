import type { TokenUsage } from "@/features/llm-usage/pricing";
import {
  ParseError,
  type ChatCompletionTransport,
  type ParseFailure,
} from "@/features/llm/chat";

/** Re-exported for callers that classify transport failures without importing the shared module. */
export { ParseError };
export type { ParseFailure };

export type DeepSeekSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

/**
 * The key is inlined into the JS bundle at build time, so it is extractable from the APK.
 * Route this through a proxy before distributing the app beyond personal use.
 */
export const DEEPSEEK_SETTINGS: DeepSeekSettings = {
  apiKey: process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY ?? "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-flash",
  timeoutMs: 20_000,
};

function cancelled(): Error {
  const error = new Error("Parsing cancelled");
  error.name = "AbortError";
  return error;
}

function failureForStatus(status: number): ParseFailure {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "invalid_response";
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

/** OpenAI-compatible usage block; cache fields differ between providers, so both shapes are read. */
export function readTokenUsage(payload: unknown): TokenUsage | null {
  if (!payload || typeof payload !== "object" || !("usage" in payload))
    return null;
  const raw = (payload as { usage?: unknown }).usage;
  if (!raw || typeof raw !== "object") return null;
  const usage = raw as Record<string, unknown>;
  const details =
    usage.prompt_tokens_details && typeof usage.prompt_tokens_details === "object"
      ? (usage.prompt_tokens_details as Record<string, unknown>)
      : {};
  const promptTokens = count(usage.prompt_tokens);
  const completionTokens = count(usage.completion_tokens);
  const cacheHitTokens =
    usage.prompt_cache_hit_tokens === undefined
      ? count(details.cached_tokens)
      : count(usage.prompt_cache_hit_tokens);
  const cacheMissTokens =
    usage.prompt_cache_miss_tokens === undefined
      ? Math.max(0, promptTokens - cacheHitTokens)
      : count(usage.prompt_cache_miss_tokens);
  if (promptTokens === 0 && completionTokens === 0) return null;
  return { promptTokens, cacheHitTokens, cacheMissTokens, completionTokens };
}

/** Reports one billed call; a statistics failure must never break recognition. */
export type UsageSink = (model: string, usage: TokenUsage) => void;

/**
 * One request per submission: thinking is disabled to keep latency near the model's
 * first-token time, and JSON mode removes the need for a grammar constraint.
 */
export function createDeepSeekTransport(
  settings: DeepSeekSettings,
  http: typeof fetch = fetch,
  onUsage?: UsageSink,
): ChatCompletionTransport {
  return async function complete(body, signal) {
    if (!settings.apiKey) {
      throw new ParseError("missing_key", "DeepSeek API key is not configured");
    }
    if (signal?.aborted) throw cancelled();
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, settings.timeoutMs);
    try {
      const response = await http(`${settings.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ParseError(
          failureForStatus(response.status),
          `DeepSeek request failed with ${response.status}`,
        );
      }
      const payload = await response.json();
      const usage = readTokenUsage(payload);
      if (usage && onUsage) {
        try {
          onUsage(body.model, usage);
        } catch (error) {
          console.warn("[llm-usage] Failed to report token usage", error);
        }
      }
      return payload;
    } catch (error) {
      if (timedOut) throw new ParseError("timeout", "DeepSeek request timed out");
      if (signal?.aborted) throw cancelled();
      if (error instanceof ParseError) throw error;
      throw new ParseError(
        "network",
        error instanceof Error ? error.message : "DeepSeek request failed",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  };
}

export const deepSeekTransport = createDeepSeekTransport(DEEPSEEK_SETTINGS);
