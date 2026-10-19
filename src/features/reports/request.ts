import type { ChatCompletionRequest } from "@/features/llm/chat";
import type { ReportAnalysisInput } from "./llm-payload";
import { reportsText } from "./labels";

/** A whole year still serializes far below this; the guard only exists to fail closed. */
const MAX_PAYLOAD_CHARACTERS = 12_000;

export function buildReportRequest(
  input: ReportAnalysisInput,
  model: string,
): ChatCompletionRequest {
  const payload = JSON.stringify(input);
  if (payload.length > MAX_PAYLOAD_CHARACTERS)
    throw new Error("Report payload exceeds the request contract limit");
  return {
    model,
    temperature: 0.3,
    max_tokens: 2048,
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
    messages: [
      { role: "system", content: reportsText.systemPrompt },
      { role: "user", content: payload },
    ],
  };
}
