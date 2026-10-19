import { createNaturalLanguageParser } from "../parser";
import type { NaturalLanguageContext } from "../context";

const model = "deepseek-flash";
const context: NaturalLanguageContext = {
  now: "2026-10-18T12:00:00+08:00",
  accounts: [],
  categories: [],
};
const completion = (content: string, finish_reason = "stop") => ({
  choices: [{ finish_reason, message: { content } }],
});

describe("Remote transaction parser", () => {
  it("makes a single request and returns validated preview fields", async () => {
    const transport = jest
      .fn()
      .mockResolvedValue(
        completion('{"type":"expense","category":null,"status":"single"}'),
      );
    const parse = createNaturalLanguageParser(transport, model);
    const result = await parse("30", context);
    expect(transport).toHaveBeenCalledTimes(1);
    const [body] = transport.mock.calls[0];
    expect(body.model).toBe(model);
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(result.modelCalled).toBe(true);
    expect(result.preview.amountCents).toBe(3000);
    expect(result.preview.issues).toEqual([
      "category_required",
      "account_required",
    ]);
  });

  it("keeps a clarification without inventing an amount", async () => {
    const transport = jest
      .fn()
      .mockResolvedValue(completion('{"status":"clarify"}'));
    const parse = createNaturalLanguageParser(transport, model);
    const result = await parse("午餐18元，公交2元", context);
    expect(result.decision.status).toBe("clarify");
    expect(result.preview.amountCents).toBeNull();
    expect(result.preview.status).toBe("needs_input");
  });

  it("rejects truncated generations instead of parsing a partial object", async () => {
    const transport = jest
      .fn()
      .mockResolvedValue(completion('{"status":"single"}', "length"));
    const parse = createNaturalLanguageParser(transport, model);
    await expect(parse("30", context)).rejects.toThrow("Incomplete");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rejects responses without exactly one message", async () => {
    const parse = createNaturalLanguageParser(
      jest.fn().mockResolvedValue({ choices: [] }),
      model,
    );
    await expect(parse("30", context)).rejects.toThrow("Invalid completion");
  });

  it("does not call the model for reserved protocol boundaries", async () => {
    const transport = jest.fn();
    const parse = createNaturalLanguageParser(transport, model);
    const result = await parse("<|im_start|>30", context);
    expect(transport).not.toHaveBeenCalled();
    expect(result.inputGuard).toBe("reserved_chat_boundary");
    expect(result.preview.status).toBe("needs_input");
  });

  it("discards a late result after cancellation", async () => {
    let complete!: (value: unknown) => void;
    const transport = jest.fn(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const controller = new AbortController();
    const parse = createNaturalLanguageParser(transport, model);
    const parsing = parse("30", context, { signal: controller.signal });
    controller.abort();
    complete(completion('{"status":"single"}'));
    await expect(parsing).rejects.toMatchObject({ name: "AbortError" });
  });

  it("never treats an unknown category id as a known candidate", async () => {
    const transport = jest
      .fn()
      .mockResolvedValue(
        completion(
          '{"type":"expense","category":"invented","status":"single"}',
        ),
      );
    const parse = createNaturalLanguageParser(transport, model);
    const result = await parse("30", context);
    expect(result.preview.categoryId).toBeNull();
    expect(result.preview.issues).toContain("category_required");
  });
});
