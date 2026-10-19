import type { NaturalLanguageContext } from "./context";
import { completedModelContent, type ChatCompletionTransport } from "@/features/llm/chat";
import { createFieldContract } from "./field-contract";
import { buildTransactionRequest } from "./requests";
import {
  validateNaturalLanguageDecision,
  type FieldDecision,
} from "./validation";

export type NaturalLanguageRequestTransport = ChatCompletionTransport;

function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error("Parsing cancelled");
    error.name = "AbortError";
    throw error;
  }
}

export function snapshotNaturalLanguageContext(
  context: NaturalLanguageContext,
): NaturalLanguageContext {
  return {
    ...context,
    accounts: context.accounts.map((row) => ({
      ...row,
      ...(row.aliases ? { aliases: [...row.aliases] } : {}),
    })),
    categories: context.categories.map((row) => ({
      ...row,
      ...(row.examples ? { examples: [...row.examples] } : {}),
    })),
  };
}

const EMPTY_DECISION: FieldDecision = {
  type: null,
  amount: null,
  category: null,
  account: null,
  to_account: null,
  status: "clarify",
  note: null,
};

const RESERVED_BOUNDARY =
  /<\|(?:im_start|im_end|im_sep|system|user|assistant)\|>|\[\/?INST\]/;

export function createNaturalLanguageParser(
  transport: NaturalLanguageRequestTransport,
  model: string,
) {
  return async function parseNaturalLanguageTransaction(
    text: string,
    context: NaturalLanguageContext,
    options: { signal?: AbortSignal } = {},
  ) {
    checkCancelled(options.signal);
    const captured = snapshotNaturalLanguageContext(context);
    const started = performance.now();
    const blocked = RESERVED_BOUNDARY.test(text);
    let decision: FieldDecision = EMPTY_DECISION;
    if (!blocked) {
      const content = completedModelContent(
        await transport(
          buildTransactionRequest(text, captured, model),
          options.signal,
        ),
      );
      checkCancelled(options.signal);
      decision = createFieldContract(text, captured).decode(content);
    }
    const preview = validateNaturalLanguageDecision(text, captured, decision);
    checkCancelled(options.signal);
    return {
      decision,
      preview,
      modelCalled: !blocked,
      inputGuard: blocked ? "reserved_chat_boundary" : null,
      elapsedMs: performance.now() - started,
    };
  };
}
