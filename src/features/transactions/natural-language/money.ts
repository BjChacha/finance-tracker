/** Integer-only normalization of a model-selected CNY span. */
const DIGITS: Readonly<Record<string, number>> = Object.fromEntries(
  Array.from(
    "\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u3007\u4e24",
  ).map((digit, index) => [digit, index < 10 ? index : index === 10 ? 0 : 2]),
);
const UNITS: Readonly<Record<string, number>> = {
  "\u5341": 10,
  "\u767e": 100,
  "\u5343": 1000,
};

function integer(text: string): bigint | null {
  if (/^[0-9]+$/.test(text)) return BigInt(text);
  if (!text) return null;
  const characters = Array.from(text);
  if (characters.every((char) => DIGITS[char] !== undefined)) {
    return BigInt(characters.map((char) => DIGITS[char]).join(""));
  }
  let total = 0;
  let current: number | null = null;
  let previousUnit = 10000;
  for (const char of characters) {
    if (DIGITS[char] !== undefined) {
      if (current !== null && current !== 0) return null;
      current = DIGITS[char];
    } else if (UNITS[char] !== undefined) {
      const unit = UNITS[char];
      if (unit >= previousUnit || (current === null && unit !== 10))
        return null;
      total += (current ?? 1) * unit;
      current = null;
      previousUnit = unit;
    } else {
      return null;
    }
  }
  if (
    current !== null &&
    previousUnit >= 100 &&
    !/[\u96f6\u3007]/.test(text.slice(-2, -1))
  ) {
    return null;
  }
  return BigInt(total + (current ?? 0));
}

function whole(text: string): bigint | null {
  if (!text.includes("\u4e07")) return integer(text);
  const parts = text.split("\u4e07");
  if (parts.length !== 2) return null;
  const high = integer(parts[0]);
  const low = parts[1] ? integer(parts[1]) : 0n;
  if (high === null || low === null || low >= 10000n) return null;
  if (parts[1] && low < 1000n && !/^[\u96f6\u3007]/.test(parts[1])) return null;
  return high * 10000n + low;
}

export function parseNaturalLanguageMoney(span: string): number | null {
  if (span.length > 200) return null;
  let text = span
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/^[\u00a5\uffe5]/, "")
    .replace(/[\u6574\u94b1]$/, "");
  if (text.includes(",")) {
    if (!/^[0-9]{1,3}(,[0-9]{3})+(\.[0-9]{1,2})?[\u5143\u5757]?$/.test(text))
      return null;
    text = text.replace(/,/g, "");
  }
  const split = /^(.+?)[\u5143\u5757](.*)$/.exec(text);
  let base = split ? split[1] : text;
  let fraction = split ? split[2] : "";
  if (!split && /[\u89d2\u6bdb\u5206]/.test(text)) {
    base = "0";
    fraction = text;
  }
  const decimal = /^(.+?)[.\u70b9](.+)$/.exec(base);
  let cents: bigint;
  if (decimal) {
    const units = whole(decimal[1]);
    const tail = Array.from(decimal[2], (char) =>
      String(DIGITS[char] ?? char),
    ).join("");
    if (units === null || !/^[0-9]{1,2}$/.test(tail) || fraction) return null;
    cents = units * 100n + BigInt(tail.padEnd(2, "0"));
  } else {
    const units = whole(base);
    if (units === null) return null;
    cents = units * 100n;
    if (fraction) {
      const short = integer(fraction);
      if (short !== null && short >= 0n && short <= 9n) {
        cents += short * 10n;
      } else {
        const parts =
          /^(?:(.+?)[\u89d2\u6bdb])?(?:(.+?)\u5206|([0-9\u96f6\u3007\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d]))?$/.exec(
            fraction,
          );
        if (!parts || !(parts[1] || parts[2] || parts[3])) return null;
        const tenths = parts[1] ? integer(parts[1]) : 0n;
        // A bare digit after jiao/mao is fen in colloquial speech: 6 jiao 7 = 0.67.
        const hundredthsText = parts[2] ?? parts[3];
        const hundredths = hundredthsText !== undefined ? integer(hundredthsText) : 0n;
        if (
          tenths === null ||
          hundredths === null ||
          tenths < 0n ||
          tenths > 9n ||
          hundredths < 0n ||
          hundredths > 9n
        )
          return null;
        cents += tenths * 10n + hundredths;
      }
    }
  }
  return cents > 0n && cents <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(cents)
    : null;
}

export type AmountCandidate = {
  id: string;
  text: string;
  /** Unicode code point offsets, matching the frozen Python reference. */
  start: number;
  end: number;
  cents: number;
};

const NUM =
  "[0-9\uff10-\uff19\u96f6\u3007\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07]+";
const DECIMAL = `${NUM}(?:[.\uff0e\u70b9]${NUM})?`;
const NUMBER = `(?:[0-9]{1,3}(?:,[0-9]{3})+(?:\\.[0-9]+)?|${DECIMAL})`;
// Amounts tolerate inner whitespace (colloquial "17 块 5"); the span keeps the
// original spacing so it still matches the user's sentence verbatim.
const PATTERN = `[-\u8d1f]?${NUMBER}(?:\\s*[\u5143\u5757](?:\\s*${NUMBER}\\s*[\u89d2\u6bdb](?:\\s*${NUMBER}\\s*\u5206)?|\\s*${NUMBER}\\s*\u5206|\\s*${NUMBER})?|\\s*[\u89d2\u6bdb](?:\\s*${NUMBER}\\s*\u5206|\\s*${NUMBER})?|\\s*\u5206)?(?:\\s*[\u94b1\u6574])?`;

/** Candidates are evidence, never an authorization to create a transaction. */
export function naturalLanguageAmountCandidates(
  text: string,
): AmountCandidate[] {
  const result: AmountCandidate[] = [];
  for (const match of text.matchAll(new RegExp(PATTERN, "gu"))) {
    const cents = parseNaturalLanguageMoney(match[0]);
    if (cents === null) continue;
    const start = Array.from(text.slice(0, match.index)).length;
    result.push({
      id: `m${result.length}`,
      text: match[0],
      start,
      end: start + Array.from(match[0]).length,
      cents,
    });
  }
  return result;
}

export function splitNaturalLanguageAmounts(
  text: string,
  amounts: readonly AmountCandidate[],
) {
  const characters = Array.from(text);
  const candidates: AmountCandidate[] = [];
  const quantities: AmountCandidate[] = [];
  for (const amount of amounts) {
    const quantity =
      !/[\u5143\u5757\u89d2\u5206\u70b9.\uff0e]/.test(amount.text) &&
      /^[\u5f20\u4e2a\u652f\u53ea\u672c\u888b\u74f6\u4ef6\u53f0\u8f86\u4f4d\u4eba\u6b21]$/.test(
        characters[amount.end] ?? "",
      );
    (quantity ? quantities : candidates).push(amount);
  }
  return { candidates, quantities };
}
