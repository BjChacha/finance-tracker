import fixture from "./validation-parity.json";
import {
  validateNaturalLanguageDecision,
  type FieldDecision,
} from "../validation";
import { auditAccountEvidence, accountMentions } from "../account-evidence";
import {
  dayFromEvidence,
  periodFromEvidence,
  requiresDateConfirmation,
} from "../dates";
import type { NaturalLanguageContext } from "../context";

const PERIOD_WORDS =
  /\u51cc\u6668|\u6e05\u6668|\u65e9\u6668|\u65e9\u4e0a|\u4e0a\u5348|\u4e2d\u5348|\u6b63\u5348|\u4e0b\u5348|\u508d\u6669|\u665a\u4e0a|\u665a\u95f4|\u591c\u91cc|\u591c\u665a|\u534a\u591c|\u5348\u591c/u;

describe("Natural language business review", () => {
  // The frozen fixture predates remote inference: it pins the old "note = raw text" and the
  // clock-at-now dateMs. Notes are now model-refined, and period words move the clock, so this
  // suite compares every other field exactly and checks dateMs against the same reference day.
  it.each(fixture.records)("matches reference review for $id", (record) => {
    const context = (fixture.contexts as Record<string, unknown>)[
      record.context
    ] as NaturalLanguageContext;
    const { note, dateMs, ...business } =
      validateNaturalLanguageDecision(
        record.text,
        context,
        record.decision as FieldDecision,
      );
    const {
      note: _expectedNote,
      dateMs: expectedDateMs,
      ...expectedBusiness
    } = record.expected;
    expect(business).toEqual(expect.objectContaining(expectedBusiness));
    expect(typeof note).toBe("string");
    expect(dateMs === null).toBe(expectedDateMs === null);
    if (!PERIOD_WORDS.test(record.text) && expectedDateMs !== null)
      expect(dateMs).toBe(expectedDateMs);
  });

  const context: NaturalLanguageContext = {
    now: "2026-10-18T12:00:00+08:00",
    categories: [],
    accounts: [
      { id: "a", name: "Wallet" },
      { id: "b", name: "Bank" },
    ],
  };
  it.each([
    // 明确的原文证据优先于模型：句子里就有「刀」，模型没读到也不能记成人民币
    ["Netflix订阅花了2.99刀", null, "USD"],
    ["Netflix订阅花了2.99刀", "CNY", "USD"],
    ["Netflix订阅花了2.99刀", "USD", "USD"],
    // 无本地证据时用模型判断（覆盖无标记但语境明确的外币）
    ["Netflix subscription 2.99", "USD", "USD"],
    ["打车花了30块", null, "CNY"],
    // 多种外币并存时证据失效，交给模型
    ["3.99美元和2.99欧元", "EUR", "EUR"],
  ])("resolves currency for %j", (text, modelCurrency, expected) => {
    const result = validateNaturalLanguageDecision(text, context, {
      type: "expense",
      amount: null,
      amountCents: 299,
      currency: modelCurrency,
      category: null,
      account: null,
      to_account: null,
      status: "single",
      note: null,
    });
    expect(result.currency).toBe(expected);
  });

  it("requires review for reversed or unsupported transfer direction without correcting the model", () => {
    const text = "Wallet\u8f6c30\u5143\u5230Bank";
    const correct = { type: "transfer", account: "a", to_account: "b" };
    expect(auditAccountEvidence(text, context, correct).directionVerified).toBe(
      true,
    );
    const reversed = { type: "transfer", account: "b", to_account: "a" };
    const result = auditAccountEvidence(text, context, reversed);
    expect(result.directionVerified).toBe(false);
    expect(result.confirmationFields).toEqual(["account", "to_account"]);
    expect(reversed.account).toBe("b");
    expect(
      auditAccountEvidence("Wallet and Bank", context, correct)
        .directionVerified,
    ).toBe(false);
  });

  it("retains longest aliases, duplicate IDs, and code point offsets", () => {
    const accounts = [
      { id: "a", name: "Bank" },
      { id: "b", name: "My Bank" },
      { id: "c", name: "My Bank" },
    ];
    expect(
      accountMentions("\u{1f4b3}My Bank", { ...context, accounts }),
    ).toEqual([
      { start: 1, end: 8, text: "My Bank", candidate_ids: ["b", "c"] },
    ]);
  });

  it("recognizes supported days and requires review for unsupported calendar words", () => {
    expect(dayFromEvidence("\u6628\u5929")).toBe("yesterday");
    expect(dayFromEvidence("\u524d\u5929")).toBe("before_yesterday");
    expect(dayFromEvidence("\u6628\u5929\u4eca\u5929")).toBe("unknown");
    expect(dayFromEvidence("2026/10/01")).toBe("unknown");
    expect(requiresDateConfirmation("\u5468\u672b")).toBe(true);
  });

  it("reads explicit period words without treating meals as times", () => {
    expect(periodFromEvidence("\u4e2d\u5348\u5bff\u53f8\u90ce 155")).toEqual({
      hours: 12,
      minutes: 0,
    });
    expect(periodFromEvidence("\u665a\u4e0a\u8d85\u5e02 30")).toEqual({
      hours: 20,
      minutes: 0,
    });
    expect(periodFromEvidence("\u534a\u591c\u70b9\u7ca5 19.9")).toEqual({
      hours: 0,
      minutes: 0,
    });
    expect(periodFromEvidence("\u5348\u996d 18")).toBeNull();
    expect(periodFromEvidence("\u65e9\u4e0a\u4e70\u4e86\uff0c\u665a\u4e0a\u53c8\u4e70")).toBeNull();
  });

  it("applies the recognized period to the draft time", () => {
    const midday = new Date("2026-10-18T12:00:00+08:00");
    const noon = new Date(midday.getTime());
    noon.setHours(12, 0, 0, 0);
    const evening = new Date(midday.getTime());
    evening.setHours(20, 0, 0, 0);
    const midnight = new Date(midday.getTime());
    midnight.setHours(0, 0, 0, 0);
    const yesterdayEvening = new Date(evening.getTime() - 86400000);
    const decision = {
      type: "expense" as const,
      amount: "m0",
      amountCents: null,
      currency: null,
      category: null,
      account: null,
      to_account: null,
      status: "single" as const,
      note: "\u5bff\u53f8\u90ce",
    };
    const day: NaturalLanguageContext = {
      now: "2026-10-18T12:00:00+08:00",
      accounts: [],
      categories: [],
    };
    expect(
      validateNaturalLanguageDecision("\u4eca\u5929\u4e2d\u5348\u5bff\u53f8\u90ce155", day, decision)
        .dateMs,
    ).toBe(noon.getTime());
    expect(
      validateNaturalLanguageDecision("\u665a\u4e0a\u8d85\u5e02 30", day, decision).dateMs,
    ).toBe(evening.getTime());
    expect(
      validateNaturalLanguageDecision("\u534a\u591c\u70b9\u7ca5 19.9", day, decision).dateMs,
    ).toBe(midnight.getTime());
    expect(
      validateNaturalLanguageDecision("\u6628\u5929\u665a\u4e0a\u8d85\u5e02 30", day, decision)
        .dateMs,
    ).toBe(yesterdayEvening.getTime());
  });

  it("keeps the model-refined note out of the raw sentence", () => {
    const decision = {
      type: "expense" as const,
      amount: "m0",
      amountCents: null,
      currency: null,
      category: null,
      account: null,
      to_account: null,
      status: "single" as const,
      note: "\u5bff\u53f8\u90ce",
    };
    expect(
      validateNaturalLanguageDecision(
        "\u4eca\u5929\u4e2d\u5348\u53bb\u5bff\u53f8\u90ce\u5403\u4e86155\u5143",
        context,
        decision,
      ).note,
    ).toBe("\u5bff\u53f8\u90ce");
  });
});

describe("Model-authored amount precedence", () => {
  const base = {
    type: "expense" as const,
    category: null,
    account: null,
    to_account: null,
    currency: null,
    status: "single" as const,
    note: null,
  };
  const context: NaturalLanguageContext = {
    now: "2026-10-18T12:00:00+08:00",
    accounts: [],
    categories: [],
  };

  // 模型按语义算出句子里不存在的新金额（AA/分摊/优惠），不能被本地候选覆盖
  it("keeps a derived amount that matches no parsed candidate", () => {
    const result = validateNaturalLanguageDecision(
      "午餐一共吃了300，最后A了270",
      context,
      { ...base, amount: null, amountCents: 3000 },
    );
    expect(result.amountCents).toBe(3000);
    expect(result.issues).not.toContain("amount_required");
  });

  it("prefers the model amount over the candidate it pointed at", () => {
    const result = validateNaturalLanguageDecision("午饭吃了14块3", context, {
      ...base,
      amount: "m0",
      amountCents: 1437,
    });
    expect(result.amountCents).toBe(1437);
  });

  it("falls back to the parsed candidate when the model gives no amount", () => {
    const result = validateNaturalLanguageDecision("午饭吃了14块3毛7", context, {
      ...base,
      amount: "m0",
      amountCents: null,
    });
    expect(result.amountCents).toBe(1437);
  });

  it("still reports a missing amount when neither side has one", () => {
    const result = validateNaturalLanguageDecision("午饭吃了一顿", context, {
      ...base,
      amount: null,
      amountCents: null,
    });
    expect(result.amountCents).toBeNull();
    expect(result.issues).toContain("amount_required");
  });
});
