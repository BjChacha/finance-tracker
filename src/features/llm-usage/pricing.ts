/**
 * DeepSeek pricing in CNY per 1,000,000 tokens.
 *
 * Source: https://api-docs.deepseek.com/zh-cn/quick_start/pricing (read 2026-10-18).
 * Off-peak is exactly half of peak. Peak is Beijing time Mon–Fri 09:00–12:00 and 14:00–18:00,
 * excluding Chinese statutory holidays. Holiday calendars are not modelled here: a weekday
 * holiday inside those windows is billed as peak (an overestimate), and a make-up workday on a
 * weekend is billed as off-peak (an underestimate).
 */
export type PriceTier = "peak" | "off_peak";

type TierPrice = {
  /** Input tokens served from the prompt cache */
  cacheHit: number;
  /** Input tokens not served from cache */
  cacheMiss: number;
  /** Output tokens */
  output: number;
};

const PRICING: Readonly<Record<string, Readonly<Record<PriceTier, TierPrice>>>> = {
  "deepseek-flash": {
    off_peak: { cacheHit: 0.02, cacheMiss: 1, output: 4 },
    peak: { cacheHit: 0.04, cacheMiss: 2, output: 8 },
  },
  "deepseek-v4-pro": {
    off_peak: { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
    peak: { cacheHit: 0.3, cacheMiss: 9, output: 27 },
  },
};

const FALLBACK_MODEL = "deepseek-flash";
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export type TokenUsage = {
  promptTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  completionTokens: number;
};

/** Beijing time is derived from the epoch, so a device in another zone bills identically. */
export function priceTierAt(at: Date): PriceTier {
  const beijing = new Date(at.getTime() + BEIJING_OFFSET_MS);
  const weekday = beijing.getUTCDay();
  if (weekday === 0 || weekday === 6) return "off_peak";
  const hour = beijing.getUTCHours();
  const peak = (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
  return peak ? "peak" : "off_peak";
}

/**
 * Cost in micro-yuan (1e-6 CNY). One token at 1 CNY/M tokens is exactly 1 micro-yuan, so the
 * published unit prices multiply tokens directly without any scaling factor.
 */
export function costMicros(model: string, usage: TokenUsage, at: Date): number {
  const table = PRICING[model] ?? PRICING[FALLBACK_MODEL];
  const price = table[priceTierAt(at)];
  const total =
    usage.cacheHitTokens * price.cacheHit +
    usage.cacheMissTokens * price.cacheMiss +
    usage.completionTokens * price.output;
  return Math.round(total);
}

/** `¥0.0000` for a zero balance, otherwise four decimals — single calls cost a fraction of a cent. */
export function formatCostYuan(micros: number): string {
  const yuan = micros / 1_000_000;
  if (yuan > 0 && yuan < 0.0001) return "<¥0.0001";
  return `¥${yuan.toFixed(4)}`;
}

export const PRICED_MODELS = Object.keys(PRICING);
