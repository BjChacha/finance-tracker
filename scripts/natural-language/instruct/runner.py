"""Local-only llama.cpp lifecycle and measured structured completion requests."""

import json
import os
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import psutil
from fetch import ARTIFACTS
from harness import (
    bounded_grammar,
    grammar_for,
    parse_structure,
    prompt_for,
    schema_for,
    validate_business,
)


class Client:
    def __init__(self, port=18461):
        self.url = f"http://127.0.0.1:{port}"
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def request(self, path, body=None, timeout=60):
        request = urllib.request.Request(
            self.url + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Content-Type": "application/json"},
        )
        with self.opener.open(request, timeout=timeout) as response:
            return json.load(response)

    def parse(
        self,
        text,
        context,
        *,
        constrained=True,
        examples=True,
        cache=False,
        prompt_file=None,
    ):
        started = time.perf_counter()
        schema = schema_for(text, context)
        body = {
            "prompt": prompt_for(text, context, examples, prompt_file),
            "n_predict": 192,
            "temperature": 0,
            "seed": 42,
            "cache_prompt": cache,
            "stop": ["<|im_end|>"],
            "return_tokens": True,
        }
        if constrained:
            if prompt_file and Path(prompt_file).name == "prompt-selected.txt":
                body["grammar"] = bounded_grammar(schema)
            elif prompt_file and Path(prompt_file).name == "prompt-final.txt":
                body["grammar"] = grammar_for(text, context)
            else:
                body["json_schema"] = schema
        response = self.request("/completion", body)
        record = {
            "response": response.get("content", ""),
            "timings": response.get("timings"),
            "stop_type": response.get("stop_type"),
            "truncated": response.get("truncated", False),
            "tokens_evaluated": response.get("tokens_evaluated"),
            "tokens_cached": response.get("tokens_cached"),
            "schema_valid": False,
            "decision": None,
            "validated": None,
        }
        try:
            decision = parse_structure(record["response"], schema)
            if record["stop_type"] == "limit" or record["truncated"]:
                raise ValueError("Incomplete generation")
            record.update(
                schema_valid=True,
                decision=decision,
                validated=validate_business(decision, text, context),
            )
        except (ValueError, TypeError) as error:
            record["error"] = str(error)
        record["elapsed_ms"] = (time.perf_counter() - started) * 1000
        return record


class DesktopServer:
    def __init__(self, model, port=18461):
        self.model = Path(model).resolve()
        self.port = port
        self.client = Client(port)
        self.process = None
        self.peak_rss = 0
        self.peak_private = 0
        self.stop_sampling = threading.Event()

    def sample(self):
        process = psutil.Process(self.process.pid)
        while not self.stop_sampling.wait(0.02):
            try:
                memory = process.memory_info()
                self.peak_rss = max(self.peak_rss, memory.rss)
                self.peak_private = max(
                    self.peak_private, getattr(memory, "private", 0)
                )
            except psutil.NoSuchProcess:
                return

    def __enter__(self):
        runtime = ARTIFACTS / "runtime" / "llama-server.exe"
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        self.log = (ARTIFACTS / f"server-{self.port}.log").open("wb")
        args = [
            str(runtime),
            "-m",
            str(self.model),
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
            "--no-webui",
            "--no-context-shift",
            "--no-warmup",
        ]
        self.started = time.perf_counter()
        self.process = subprocess.Popen(
            args,
            stdin=subprocess.DEVNULL,
            stdout=self.log,
            stderr=self.log,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        self.thread = threading.Thread(target=self.sample, daemon=True)
        self.thread.start()
        try:
            while time.perf_counter() - self.started < 60:
                if self.process.poll() is not None:
                    raise RuntimeError(f"Server exited: {self.process.returncode}")
                try:
                    if self.client.request("/health", timeout=1).get("status") == "ok":
                        self.load_ms = (time.perf_counter() - self.started) * 1000
                        return self
                except (urllib.error.URLError, TimeoutError):
                    pass
                time.sleep(0.1)
            raise TimeoutError("Server startup timed out")
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def __exit__(self, *_):
        self.stop_sampling.set()
        self.thread.join(timeout=1)
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        self.log.close()
