"""Offline Python reference and loopback-only GGUF embedding adapters."""

import os
import subprocess
import time
import urllib.error

from support import ARTIFACTS, ROOT, baseline_runner


class ReferenceEncoder:
    def __init__(self, checkpoint=None):
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        import torch
        from sentence_transformers import SentenceTransformer

        torch.set_num_threads(4)
        self.model = SentenceTransformer(
            str(checkpoint or ARTIFACTS / "checkpoint"),
            device="cpu",
            local_files_only=True,
            trust_remote_code=False,
            model_kwargs={"torch_dtype": torch.float32, "attn_implementation": "sdpa"},
        )
        self.model.max_seq_length = 1024

    def tokenize(self, text):
        return self.model.tokenizer(text.strip(), add_special_tokens=True)["input_ids"]

    def encode(self, texts):
        if any(len(self.tokenize(text)) > 1024 for text in texts):
            raise ValueError("Input exceeds the frozen token budget")
        return self.model.encode(
            texts,
            prompt="",
            batch_size=8,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        ).tolist()


class LoopbackEncoder(baseline_runner.Client):
    def tokenize(self, text):
        return self.request("/tokenize", {"content": text, "add_special": True})[
            "tokens"
        ]

    def encode(self, texts):
        result = []
        for start in range(0, len(texts), 8):
            response = self.request(
                "/v1/embeddings",
                {"input": texts[start : start + 8], "encoding_format": "float"},
                timeout=180,
            )
            rows = sorted(response["data"], key=lambda row: row["index"])
            result.extend(row["embedding"] for row in rows)
        return result


def server_arguments(model, port):
    return [
        "-m",
        str(model),
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--embedding",
        "--pooling",
        "last",
        "-c",
        "1024",
        "-b",
        "1024",
        "-ub",
        "1024",
        "-t",
        "4",
        "-tb",
        "4",
        "-np",
        "1",
        "-ngl",
        "0",
        "--no-webui",
        "--no-warmup",
        "--no-context-shift",
    ]


class EmbeddingServer:
    def __init__(self, model, port=18471):
        self.model, self.port = model, port
        self.encoder = LoopbackEncoder(port)
        self.process = None

    def __enter__(self):
        self.log = (ARTIFACTS / f"server-{self.port}.log").open("wb")
        runtime = ROOT / "artifacts/natural-language-instruct/runtime/llama-server.exe"
        self.started = time.perf_counter()
        try:
            self.process = subprocess.Popen(
                [str(runtime), *server_arguments(self.model, self.port)],
                stdin=subprocess.DEVNULL,
                stdout=self.log,
                stderr=self.log,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            while time.perf_counter() - self.started < 90:
                if self.process.poll() is not None:
                    raise RuntimeError(
                        f"Embedding server exited: {self.process.returncode}"
                    )
                try:
                    if self.encoder.request("/health", timeout=1).get("status") == "ok":
                        return self
                except (urllib.error.URLError, TimeoutError):
                    pass
                time.sleep(0.1)
            raise TimeoutError("Embedding server startup timed out")
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def __exit__(self, *_):
        if self.process is not None and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        self.log.close()
