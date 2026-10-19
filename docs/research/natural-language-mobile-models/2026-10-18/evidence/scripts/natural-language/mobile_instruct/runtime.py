"""Text-only Qwen inference through a phone-owned loopback llama.cpp server."""

import re
import shlex
import sys
import threading
import time
import urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "jev_harness"))
from bridge import analyze, contract, evaluation, sha256, write_json
from support import baseline_android as native
from support import baseline_runner

ARTIFACTS = ROOT / "artifacts/natural-language-mobile-instruct"
MODEL = "Qwen3.5-4B-Q4_K_M.gguf"
REMOTE_TEMPLATE = "qwen35-official-template.jinja"


def messages_for(text, context):
    if not text.strip() or len(text) > 200:
        raise ValueError("Expected 1 to 200 characters")
    context = contract.active_context(context)
    stable = {
        "now": context["now"],
        "accounts": context["accounts"],
        "categories": context["categories"],
    }
    user = {"text": text, "amount_candidates": contract.amount_candidates(text)}
    return [
        {
            "role": "system",
            "content": (HERE / "prompt.txt").read_text(encoding="utf-8")
            + "\n"
            + contract.compact_json(stable),
        },
        {"role": "user", "content": contract.compact_json(user)},
    ]


class Client(baseline_runner.Client):
    def body_for(self, text, context, cache=True):
        schema = contract.schema_for(text, context)
        order = ("type", "amount", "category", "account", "to_account", "day", "status")
        schema["properties"] = {field: schema["properties"][field] for field in order}
        schema["required"] = list(order)
        return {
            "messages": messages_for(text, context),
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "transaction",
                    "strict": True,
                    "schema": schema,
                },
            },
            "chat_template_kwargs": {"enable_thinking": False},
            "reasoning_effort": "none",
            "temperature": 0,
            "seed": 42,
            "max_tokens": 256,
            "cache_prompt": cache,
        }

    def parse(self, text, context, cache=True):
        started = time.perf_counter()
        body = self.body_for(text, context, cache)
        record = {"schema_valid": False, "decision": None, "validated": None}
        try:
            response = self.request("/v1/chat/completions", body, timeout=240)
            choice = response["choices"][0]
            content = choice["message"].get("content") or ""
            record.update(
                response=content,
                usage=response.get("usage"),
                timings=response.get("timings"),
                finish_reason=choice["finish_reason"],
                reasoning_content=choice["message"].get("reasoning_content"),
            )
            if choice["finish_reason"] != "stop":
                raise ValueError("Incomplete generation")
            if record["reasoning_content"]:
                raise ValueError("Thinking must be disabled")
            decision = contract.parse_structure(
                content, contract.schema_for(text, context)
            )
            record.update(
                schema_valid=True,
                decision=decision,
                validated=contract.validate_business(decision, text, context),
            )
        except (ValueError, KeyError, TypeError, OSError) as error:
            record["error"] = str(error)
        record["elapsed_ms"] = (time.perf_counter() - started) * 1000
        return record


class PhoneServer(native.AndroidServer):
    def __init__(self, port=18482):
        super().__init__(MODEL, port)
        self.client = Client(port)

    def __enter__(self):
        native.adb("forward", "--no-rebind", f"tcp:{self.port}", f"tcp:{self.port}")
        self.forwarded = True
        self.started = time.perf_counter()
        try:
            arguments = shlex.join(
                [
                    "-m",
                    self.model,
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(self.port),
                    "-c",
                    "4096",
                    "-t",
                    "4",
                    "-tb",
                    "4",
                    "-np",
                    "1",
                    "-ngl",
                    "0",
                    "--jinja",
                    "--chat-template-file",
                    REMOTE_TEMPLATE,
                    "--no-webui",
                    "--no-warmup",
                    "--no-context-shift",
                ]
            )
            command = (
                f"cd {native.REMOTE}; LD_LIBRARY_PATH=runtime runtime/llama-server "
                f"{arguments} > qwen35-server.log 2>&1 & echo $!"
            )
            self.pid = native.adb("shell", command).stdout.strip()
            if not re.fullmatch(r"[0-9]+", self.pid):
                raise RuntimeError("Missing owned server PID")
            self.thread = threading.Thread(target=self.sample, daemon=True)
            self.thread.start()
            while time.perf_counter() - self.started < 90:
                try:
                    if self.client.request("/health", timeout=1).get("status") == "ok":
                        self.load_ms = (time.perf_counter() - self.started) * 1000
                        return self
                except (urllib.error.URLError, TimeoutError, ConnectionError):
                    pass
                time.sleep(0.1)
            raise TimeoutError("Phone server failed to load")
        except BaseException:
            self.__exit__(None, None, None)
            raise


__all__ = [
    "ARTIFACTS",
    "HERE",
    "ROOT",
    "PhoneServer",
    "analyze",
    "contract",
    "evaluation",
    "messages_for",
    "native",
    "sha256",
    "write_json",
]
