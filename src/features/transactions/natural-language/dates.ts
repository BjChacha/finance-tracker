import patterns from "./validation-patterns.json";

export type NaturalLanguageDay =
  | "today"
  | "yesterday"
  | "before_yesterday"
  | "unknown";
const words: ReadonlyArray<readonly [string, NaturalLanguageDay]> = [
  ["\u524d\u5929", "before_yesterday"],
  ["\u6628\u5929", "yesterday"],
  ["\u6628\u665a", "yesterday"],
  ["\u6628\u65e5", "yesterday"],
  ["\u4eca\u5929", "today"],
  ["\u4eca\u65e5", "today"],
  ["\u4eca\u65e9", "today"],
];
const unsupported = new RegExp(patterns.unsupportedCalendar, "u");
const uncertainDate =
  /\p{Decimal_Number}{4}[-/]\p{Decimal_Number}{1,2}[-/]\p{Decimal_Number}{1,2}|[\p{Decimal_Number}\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+\u6708[\p{Decimal_Number}\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+[\u65e5\u53f7]|(?:\u4e0a|\u4e0b)(?:\u5468|\u661f\u671f|\u4e2a\u6708)|[\p{Decimal_Number}\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+(?:\u5929|\u5468|\u4e2a\u6708|\u5e74)[\u524d\u540e]|\u660e\u5929|\u540e\u5929|\u5927\u524d\u5929/u;

export function dayFromEvidence(text: string): NaturalLanguageDay {
  const found = new Set(
    words.filter(([word]) => text.includes(word)).map(([, day]) => day),
  );
  if (found.size > 1 || uncertainDate.test(text)) return "unknown";
  return found.values().next().value ?? "today";
}

export function requiresDateConfirmation(text: string): boolean {
  return unsupported.test(text);
}

export type NaturalLanguagePeriod = { hours: number; minutes: number };

/** Only explicit period words are evidence; meal words such as 午饭 or 夜宵 are not. */
const PERIOD_WORDS: ReadonlyArray<readonly [string, NaturalLanguagePeriod]> = [
  ["\u51cc\u6668", { hours: 1, minutes: 0 }],
  ["\u6e05\u6668", { hours: 6, minutes: 0 }],
  ["\u65e9\u6668", { hours: 7, minutes: 0 }],
  ["\u65e9\u4e0a", { hours: 8, minutes: 0 }],
  ["\u4e0a\u5348", { hours: 10, minutes: 0 }],
  ["\u4e2d\u5348", { hours: 12, minutes: 0 }],
  ["\u6b63\u5348", { hours: 12, minutes: 0 }],
  ["\u4e0b\u5348", { hours: 15, minutes: 0 }],
  ["\u508d\u6669", { hours: 18, minutes: 0 }],
  ["\u665a\u4e0a", { hours: 20, minutes: 0 }],
  ["\u665a\u95f4", { hours: 20, minutes: 0 }],
  ["\u591c\u91cc", { hours: 22, minutes: 0 }],
  ["\u591c\u665a", { hours: 22, minutes: 0 }],
  ["\u534a\u591c", { hours: 0, minutes: 0 }],
  ["\u5348\u591c", { hours: 0, minutes: 0 }],
];

/** Conflicting or absent period words leave the clock component untouched. */
export function periodFromEvidence(text: string): NaturalLanguagePeriod | null {
  const found = PERIOD_WORDS.filter(([word]) => text.includes(word));
  const distinct = new Set(
    found.map(([, period]) => `${period.hours}:${period.minutes}`),
  );
  if (distinct.size !== 1) return null;
  return found[0][1];
}

/** Applies a period to a day offset in the device's local time zone. */
export function atTimeOfDay(
  dayMs: number,
  period: NaturalLanguagePeriod,
): number {
  const date = new Date(dayMs);
  date.setHours(period.hours, period.minutes, 0, 0);
  return date.getTime();
}
