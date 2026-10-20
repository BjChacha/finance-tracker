import fixture from "./money-parity.json";
import {
  naturalLanguageAmountCandidates,
  parseNaturalLanguageMoney,
  splitNaturalLanguageAmounts,
} from "../money";

describe("Natural language amount parity", () => {
  it.each(fixture.spans)(
    "normalizes $text to exact cents",
    ({ text, cents }) => {
      expect(parseNaturalLanguageMoney(text)).toBe(cents);
    },
  );

  it.each(fixture.records.map((record, index) => ({ ...record, index })))(
    "preserves candidate IDs, amounts and code point offsets for record $index",
    ({ text, all, candidates, quantities }) => {
      const actual = naturalLanguageAmountCandidates(text);
      expect(actual).toEqual(all);
      expect(splitNaturalLanguageAmounts(text, actual)).toEqual({
        candidates,
        quantities,
      });
      for (const span of actual) {
        expect(Array.from(text).slice(span.start, span.end).join("")).toBe(
          span.text,
        );
      }
    },
  );

  it("rejects excessive spans before integer conversion", () => {
    expect(parseNaturalLanguageMoney("9".repeat(201))).toBeNull();
  });
});

describe("Colloquial spans with inner spaces and bare jiao/fen digits", () => {
  it.each([
    ["中午吃饭花了 17 块 5", "17 块 5", 1750],
    ["买包纸巾花了 6 角 7", "6 角 7", 67],
    [" 十五块 7", "十五块 7", 1570],
    ["打車 ２３ 块 ４", "２３ 块 ４", 2340],
  ])("keeps %j as one candidate", (text, span, cents) => {
    const candidates = naturalLanguageAmountCandidates(text);
    const hit = candidates.find((candidate) => candidate.text === span);
    expect(hit).toMatchObject({ cents });
    expect(
      Array.from(text)
        .slice(hit!.start, hit!.end)
        .join(""),
    ).toBe(span);
  });

  it.each([
    ["6角7", 67],
    ["六角七", 67],
    ["6角7分", 67],
    ["六角七分", 67],
    ["3 元 5", 350],
    ["１７　块　５", 1750],
  ])("parses %j", (span, cents) => {
    expect(parseNaturalLanguageMoney(span)).toBe(cents);
  });

  it.each([
    ["6角17", null],
    ["6角七十七", null],
    ["17块15", null],
  ])("still rejects ambiguous %j", (span, cents) => {
    expect(parseNaturalLanguageMoney(span)).toBe(cents);
  });

  it("does not glue numbers across non-space words", () => {
    const texts = [
      "买了 3 个苹果和 5 个橘子",
      "12 34块",
      "订单号 96125，微信付了 42 元",
    ];
    for (const text of texts) {
      for (const candidate of naturalLanguageAmountCandidates(text)) {
        expect(candidate.text).not.toMatch(/[和个号，,]/);
      }
    }
    const glued = naturalLanguageAmountCandidates("12 34块").map((c) => c.text);
    expect(glued).toEqual(["12", "34块"]);
  });
});
