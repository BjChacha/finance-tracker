import { createFieldContract } from "../field-contract";
import { buildTransactionRequest } from "../requests";
import { parseModelFields } from "../strict-json";
import type { NaturalLanguageContext } from "../context";

const context: NaturalLanguageContext = {
  now: "2026-10-18T12:00:00+08:00",
  accounts: [],
  categories: [],
};

describe("Field contract decoder", () => {
  it("decodes a complete response", () => {
    const contract = createFieldContract("30", context);
    expect(
      contract.decode(
        '{"type":"expense","amount":"m0","category":null,"account":null,"to_account":null,"status":"single"}',
      ),
    ).toEqual({
      type: "expense",
      amount: "m0",
      category: null,
      account: null,
      to_account: null,
      status: "single",
      note: null,
    });
  });

  it("derives the unique amount only after semantic single confirmation", () => {
    const contract = createFieldContract("30", context);
    expect(
      contract.decode('{"type":"expense","category":null,"status":"single"}')
        .amount,
    ).toBe("m0");
    expect(
      contract.decode('{"type":"expense","category":null,"status":"clarify"}')
        .amount,
    ).toBeNull();
  });

  it("drops unknown ids and unknown types instead of trusting them", () => {
    const contract = createFieldContract("30", context);
    expect(
      contract.decode(
        '{"type":"refund","amount":"m9","category":"invented","account":"invented","status":"single"}',
      ),
    ).toEqual({
      type: null,
      amount: null,
      category: null,
      account: null,
      to_account: null,
      status: "single",
      note: null,
    });
  });

  it("treats an unrecognized status as clarification", () => {
    const contract = createFieldContract("30", context);
    expect(contract.decode('{"status":"maybe"}').status).toBe("clarify");
  });

  it("keeps only a sanitized refined note", () => {
    const contract = createFieldContract("\u4eca\u5929\u4e2d\u5348\u53bb\u5bff\u53f8\u90ce\u5403\u4e86155\u5143", context);
    expect(
      contract.decode('{"type":"expense","status":"single","note":"  \u5bff\u53f8\u90ce "}')
        .note,
    ).toBe("\u5bff\u53f8\u90ce");
    expect(
      contract.decode('{"status":"clarify","note":"   "}').note,
    ).toBeNull();
    expect(
      contract.decode('{"status":"single","note":"a\\nb\\tc"}').note,
    ).toBe("a b c");
    const long = contract.decode(
      `{"status":"single","note":"${"\u5b57".repeat(40)}"}`,
    ).note;
    expect(Array.from(long ?? "")).toHaveLength(24);
  });

  it("ignores extra properties but still validates the known ones", () => {
    const contract = createFieldContract("30", context);
    expect(
      contract.decode(
        '{"type":"income","amount":"m0","status":"single","note":"extra"}',
      ),
    ).toMatchObject({ type: "income", amount: "m0", status: "single" });
  });

  it.each([
    '{"type":"expense","type":"income"}',
    '{"type":"expense","\\u0074ype":"income"}',
    '{"type":{"nested":null}}',
    '{"type":1}',
    '{"type":true}',
    '{"type":"expense",}',
    '{"type":null} trailing',
    '{"type":"bad\nstring"}',
    "[]",
  ])("rejects invalid flat responses: %s", (response) => {
    expect(() => parseModelFields(response)).toThrow();
  });

  it("preserves literal separators in strings and safely handles prototype keys", () => {
    expect(parseModelFields('{"value":"a,b:c\\\"d","__proto__":null}')).toEqual(
      { value: 'a,b:c"d', ["__proto__"]: null },
    );
  });
});

describe("Remote request body", () => {
  it("sends candidates, disables thinking, and asks for JSON output", () => {
    const body = buildTransactionRequest("30", context, "deepseek-flash");
    expect(body).toMatchObject({
      model: "deepseek-flash",
      temperature: 0,
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
    });
    expect(body.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
    ]);
    expect(body.messages[0].content).toContain("候选账户");
    expect(body.messages[0].content).toContain("json");
    expect(JSON.parse(body.messages[1].content)).toEqual({
      text: "30",
      amount_candidates: [
        expect.objectContaining({ id: "m0", cents: 3000 }),
      ],
    });
  });

  it("rejects empty or oversized input before building a request", () => {
    expect(() => buildTransactionRequest("   ", context, "deepseek-flash"))
      .toThrow("Expected 1 to 200 characters");
    expect(() =>
      buildTransactionRequest("好".repeat(201), context, "deepseek-flash"),
    ).toThrow("Expected 1 to 200 characters");
  });
});
