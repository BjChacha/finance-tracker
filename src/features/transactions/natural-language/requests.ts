import prompts from "./prompts.json";
import type { NaturalLanguageContext } from "./context";
import { createFieldContract } from "./field-contract";

/** Request body for the OpenAI-compatible chat completions endpoint. */
export type NaturalLanguageRequest = {
  model: string;
  temperature: number;
  max_tokens: number;
  response_format: { type: "json_object" };
  thinking: { type: "disabled" };
  messages: { role: "system" | "user"; content: string }[];
};

const MAX_INPUT_CHARACTERS = 200;

export function assertNaturalLanguageInput(text: string) {
  if (!text.trim() || Array.from(text).length > MAX_INPUT_CHARACTERS)
    throw new Error("Expected 1 to 200 characters");
}

/**
 * One round trip covers both eligibility and field extraction. Candidates are request-local
 * aliases, so a model can only select from the snapshot taken for this submission.
 */
export function buildTransactionRequest(
  text: string,
  context: NaturalLanguageContext,
  model: string,
): NaturalLanguageRequest {
  assertNaturalLanguageInput(text);
  const contract = createFieldContract(text, context);
  const accounts = contract.context.accounts.map((row) => ({
    id: row.id,
    name: row.name,
  }));
  const categories = contract.context.categories.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    ...(row.parentId !== undefined ? { parentId: row.parentId } : {}),
  }));
  const system = [
    prompts.transactionSystem,
    `候选账户：${JSON.stringify(accounts)}`,
    `候选分类：${JSON.stringify(categories)}`,
    "示例：",
    ...prompts.transactionExamples.map((example) => `- ${example}`),
  ].join("\n");
  return {
    model,
    temperature: 0,
    max_tokens: 256,
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: JSON.stringify({
          text,
          amount_candidates: contract.candidates,
        }),
      },
    ],
  };
}
