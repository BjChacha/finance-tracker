/** Shared OpenAI-compatible chat-completions contract for every feature that calls a model. */

export type ChatMessage = { role: "system" | "user"; content: string };

export type ChatCompletionRequest = {
  model: string;
  temperature: number;
  max_tokens: number;
  response_format?: { type: "json_object" };
  /** DeepSeek-only switch; providers without it ignore the field or reject the request. */
  thinking?: { type: "disabled" };
  messages: ChatMessage[];
};

export type ChatCompletionTransport = (
  body: ChatCompletionRequest,
  signal?: AbortSignal,
) => Promise<unknown>;

export type ParseFailure =
  | "missing_key"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "server"
  | "network"
  | "invalid_response";

export class ParseError extends Error {
  constructor(
    readonly failure: ParseFailure,
    message: string,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

/** Chat-completions output is only usable when it finished with a single message. */
export function completedModelContent(response: unknown): string {
  if (
    !response ||
    typeof response !== "object" ||
    !("choices" in response) ||
    !Array.isArray(response.choices) ||
    response.choices.length !== 1
  )
    throw new ParseError("invalid_response", "Invalid completion response");
  const choice = response.choices[0];
  if (!choice || typeof choice !== "object") {
    throw new ParseError("invalid_response", "Invalid completion response");
  }
  const message = "message" in choice ? choice.message : undefined;
  if (
    !message ||
    typeof message !== "object" ||
    !("content" in message) ||
    typeof message.content !== "string"
  )
    throw new ParseError("invalid_response", "Invalid completion response");
  if ("finish_reason" in choice && choice.finish_reason === "length")
    throw new ParseError("invalid_response", "Incomplete model output");
  return message.content;
}
