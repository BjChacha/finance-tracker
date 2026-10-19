import {
  DEEPSEEK_SETTINGS,
  ParseError,
  createDeepSeekTransport,
} from "../deepseek";

const settings = {
  apiKey: "test-key",
  baseUrl: "https://api.example.com",
  model: "deepseek-flash",
  timeoutMs: 50,
};
const body = {
  model: "deepseek-flash",
  temperature: 0,
  max_tokens: 256,
  response_format: { type: "json_object" as const },
  thinking: { type: "disabled" as const },
  messages: [{ role: "system" as const, content: "s" }],
};

function response(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

it("sends the key, disables thinking, and returns the parsed payload", async () => {
  const http = jest.fn(async () => response(200, { choices: [] }));
  const transport = createDeepSeekTransport(settings, http);
  await expect(transport(body)).resolves.toEqual({ choices: [] });
  expect(http).toHaveBeenCalledWith(
    "https://api.example.com/chat/completions",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify(body),
      headers: expect.objectContaining({
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
      }),
    }),
  );
});

it.each([
  [401, "unauthorized"],
  [403, "unauthorized"],
  [429, "rate_limited"],
  [500, "server"],
  [400, "invalid_response"],
] as const)("maps HTTP %s to %s", async (status, failure) => {
  const transport = createDeepSeekTransport(
    settings,
    jest.fn(async () => response(status, {})),
  );
  await expect(transport(body)).rejects.toMatchObject({ failure });
});

it("reports a timeout instead of a generic network error", async () => {
  const http = jest.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      }),
  );
  const transport = createDeepSeekTransport(settings, http);
  await expect(transport(body)).rejects.toMatchObject({ failure: "timeout" });
});

it("propagates caller cancellation as an AbortError", async () => {
  const http = jest.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      }),
  );
  const transport = createDeepSeekTransport(settings, http);
  const controller = new AbortController();
  const pending = transport(body, controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

it("refuses to call the endpoint without a key", async () => {
  const http = jest.fn();
  const transport = createDeepSeekTransport({ ...settings, apiKey: "" }, http);
  await expect(transport(body)).rejects.toBeInstanceOf(ParseError);
  expect(http).not.toHaveBeenCalled();
});

it("keeps the configured defaults aligned with the pinned model", () => {
  expect(DEEPSEEK_SETTINGS.model).toBe("deepseek-flash");
  expect(DEEPSEEK_SETTINGS.baseUrl).toBe("https://api.deepseek.com");
  expect(DEEPSEEK_SETTINGS.timeoutMs).toBeGreaterThan(5000);
});

describe("Token usage reporting", () => {
  const payload = {
    choices: [{ finish_reason: "stop", message: { content: "{}" } }],
    usage: {
      prompt_tokens: 120,
      completion_tokens: 40,
      prompt_cache_hit_tokens: 20,
      prompt_cache_miss_tokens: 100,
    },
  };

  it("reports the provider usage split to the sink", async () => {
    const onUsage = jest.fn();
    const transport = createDeepSeekTransport(
      settings,
      jest.fn(async () => response(200, payload)),
      onUsage,
    );
    await transport(body);
    expect(onUsage).toHaveBeenCalledWith("deepseek-flash", {
      promptTokens: 120,
      cacheHitTokens: 20,
      cacheMissTokens: 100,
      completionTokens: 40,
    });
  });

  it("derives the cache miss share when only the cache-hit field is present", async () => {
    const onUsage = jest.fn();
    const transport = createDeepSeekTransport(
      settings,
      jest.fn(async () =>
        response(200, {
          choices: [],
          usage: {
            prompt_tokens: 90,
            completion_tokens: 10,
            prompt_tokens_details: { cached_tokens: 30 },
          },
        }),
      ),
      onUsage,
    );
    await transport(body);
    expect(onUsage).toHaveBeenCalledWith("deepseek-flash", {
      promptTokens: 90,
      cacheHitTokens: 30,
      cacheMissTokens: 60,
      completionTokens: 10,
    });
  });

  it("does not bill a failed request", async () => {
    const onUsage = jest.fn();
    const transport = createDeepSeekTransport(
      settings,
      jest.fn(async () => response(429, {})),
      onUsage,
    );
    await expect(transport(body)).rejects.toMatchObject({ failure: "rate_limited" });
    expect(onUsage).not.toHaveBeenCalled();
  });

  it("does not bill a response without usage numbers", async () => {
    const onUsage = jest.fn();
    const transport = createDeepSeekTransport(
      settings,
      jest.fn(async () => response(200, { choices: [] })),
      onUsage,
    );
    await transport(body);
    expect(onUsage).not.toHaveBeenCalled();
  });

  it("keeps the completion usable when the usage sink throws", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const transport = createDeepSeekTransport(
      settings,
      jest.fn(async () => response(200, payload)),
      () => {
        throw new Error("disk full");
      },
    );
    await expect(transport(body)).resolves.toEqual(payload);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
