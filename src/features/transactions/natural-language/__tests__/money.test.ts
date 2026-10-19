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
