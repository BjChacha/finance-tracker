"""Prime static model context before declaring native inference readiness."""

import time

from backend import contract


def prime_context(client, context):
    started = time.perf_counter()
    body = client.body_for("0", context)
    body["messages"][1]["content"] = contract.compact_json(
        {"text": "", "amount_candidates": []}
    )
    body["grammar"] = 'root ::= "OK"\n'
    body["max_tokens"] = 4
    body["cache_prompt"] = True
    response = client.request("/v1/chat/completions", body, timeout=120)
    choice = response["choices"][0]
    message = choice["message"]
    if (
        choice["finish_reason"] != "stop"
        or message.get("content") != "OK"
        or message.get("reasoning_content")
    ):
        raise ValueError("Model context priming did not complete successfully")
    return {
        "elapsed_ms": (time.perf_counter() - started) * 1000,
        "request": body,
        "response": response,
        "scope": "Static context only; no transaction text; no database access",
    }
