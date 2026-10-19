"""Explicit-device runtimes; preserve semantic inputs while bounding scratch memory."""

import re
import shlex
import threading
import time
import urllib.error
from copy import deepcopy

from runtime import MODEL, REMOTE_TEMPLATE, Client, contract, native  # isort: skip

from encoder import LoopbackEncoder, server_arguments
from revision import VariantParser, day_from_evidence


class DeviceServer(native.AndroidServer):
    def __init__(self, kind):
        self.kind = kind
        model = MODEL if kind == "qwen" else "jev-qwen3-0.6b-q8_0.gguf"
        super().__init__(model, 18484)
        self.client = Client(self.port)
        self.encoder = LoopbackEncoder(self.port)
        self.parser = (
            VariantParser(self.encoder, "category_only") if kind == "jev" else None
        )
        self.arguments = (
            server_arguments(model, self.port)
            if kind == "jev"
            else [
                "-m",
                model,
                "--host",
                "127.0.0.1",
                "--port",
                str(self.port),
                "-c",
                "4096",
                "-b",
                "128",
                "-ub",
                "64",
                "-t",
                "4",
                "-tb",
                "4",
                "-np",
                "1",
                "-ngl",
                "0",
                "--ctx-checkpoints",
                "4",
                "--jinja",
                "--chat-template-file",
                REMOTE_TEMPLATE,
                "--no-webui",
                "--no-warmup",
                "--no-context-shift",
            ]
        )

    def __enter__(self):
        native.adb("forward", "--no-rebind", f"tcp:{self.port}", f"tcp:{self.port}")
        self.forwarded = True
        self.started = time.perf_counter()
        try:
            command = (
                f"cd {native.REMOTE}; LD_LIBRARY_PATH=runtime runtime/llama-server "
                f"{shlex.join(self.arguments)} > comparison-{self.kind}.log 2>&1 & echo $!"
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
            raise TimeoutError("Device server did not become healthy")
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def parse(self, text, context):
        if self.parser is None:
            return self.client.parse(text, context)
        started = time.perf_counter()
        result = self.parser.parse(text, context)
        result["decision_before_boundary"] = deepcopy(result["decision"])
        decision = result["decision"]
        if "same_transfer_account" in result["validated"]["violations"]:
            decision["account"] = decision["to_account"] = None
        decision["day"] = day_from_evidence(text)
        result["validated"] = contract.validate_business(decision, text, context)
        result["elapsed_ms"] = (time.perf_counter() - started) * 1000
        return result


__all__ = ["DeviceServer", "contract", "native"]
