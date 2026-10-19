"""Classify transaction eligibility in a dedicated local model request."""

import time

from backend import HERE, contract
from safe_constraints import SafeBranchClient


class SemanticGateClient(SafeBranchClient):
    examples = False

    def body_for(self, text, context, cache=True):
        if not text.strip() or len(text) > 200:
            raise ValueError("Expected 1 to 200 characters")
        active = contract.active_context(context)
        accounts = [
            {key: row[key] for key in ("name", "aliases") if key in row}
            for row in active["accounts"]
        ]
        messages = [
            {
                "role": "system",
                "content": (HERE / "gate_prompt.txt").read_text(encoding="utf-8")
                + "\n"
                + contract.compact_json({"accounts": accounts}),
            },
            {"role": "user", "content": contract.compact_json({"text": text})},
        ]
        if self.examples:
            messages[0]["content"] += "\n" + (HERE / "gate_examples.txt").read_text(
                encoding="utf-8"
            )
        for message in messages:
            message["content"] = (
                message["content"].replace("<", r"\u003c").replace(">", r"\u003e")
            )
        return {
            "messages": messages,
            "grammar": 'root ::= "single" | "clarify"\n',
            "chat_template_kwargs": {"enable_thinking": False},
            "reasoning_effort": "none",
            "temperature": 0,
            "seed": 42,
            "max_tokens": 8,
            "cache_prompt": cache,
        }

    def parse(self, text, context, cache=True):
        started = time.perf_counter()
        body = self.body_for(text, context, cache)
        result = {"schema_valid": False, "status": None, "request": body}
        try:
            response = self.request("/v1/chat/completions", body, timeout=60)
            choice = response["choices"][0]
            message = choice["message"]
            content = message.get("content") or ""
            result.update(
                response=content,
                usage=response.get("usage"),
                timings=response.get("timings"),
                finish_reason=choice["finish_reason"],
            )
            if choice["finish_reason"] != "stop" or message.get("reasoning_content"):
                raise ValueError("Incomplete gate output or unexpected thinking")
            if content not in ("single", "clarify"):
                raise ValueError("Invalid gate decision")
            result.update(schema_valid=True, status=content)
        except (ValueError, KeyError, TypeError, OSError) as error:
            result["error"] = str(error)
        result["elapsed_ms"] = (time.perf_counter() - started) * 1000
        return result
