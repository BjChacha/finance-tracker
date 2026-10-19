"""Run the exact frozen prompt/weights on desktop when the phone is unavailable."""

import json
import os
import subprocess
import threading
import time
import urllib.error

from runtime import (
    ARTIFACTS,
    HERE,
    MODEL,
    ROOT,
    Client,
    analyze,
    baseline_runner,
    contract,
    evaluation,
    sha256,
    write_json,
)


class DesktopServer(baseline_runner.DesktopServer):
    def __init__(self):
        super().__init__(ARTIFACTS / MODEL, 18483)
        self.client = Client(self.port)

    def __enter__(self):
        self.log = (ARTIFACTS / "desktop-server.log").open("wb")
        args = [
            str(ROOT / "artifacts/natural-language-instruct/runtime/llama-server.exe"),
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
            "--jinja",
            "--chat-template-file",
            str(ARTIFACTS / "upstream-chat_template.jinja"),
            "--no-webui",
            "--no-warmup",
            "--no-context-shift",
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
            while time.perf_counter() - self.started < 90:
                if self.process.poll() is not None:
                    raise RuntimeError(
                        f"Desktop server exited: {self.process.returncode}"
                    )
                try:
                    if self.client.request("/health", timeout=1).get("status") == "ok":
                        self.load_ms = (time.perf_counter() - self.started) * 1000
                        return self
                except (urllib.error.URLError, TimeoutError):
                    pass
                time.sleep(0.1)
            raise TimeoutError("Desktop startup timed out")
        except BaseException:
            self.__exit__(None, None, None)
            raise


def main():
    frozen = json.loads((ARTIFACTS / "freeze.json").read_text(encoding="utf-8"))
    if any(sha256(ROOT / name) != digest for name, digest in frozen["files"].items()):
        raise ValueError("Frozen experiment changed")
    datasets = [
        ("dev.tsv", "desktop-smoke", 10),
        ("regression.tsv", "desktop-regression", None),
        ("regression-guards.tsv", "desktop-guards", None),
    ]
    with DesktopServer() as server:
        for filename, name, limit in datasets:
            path = HERE.parent / "distribution_v1/data" / filename
            rows = evaluation.load_rows(path)
            if limit:
                rows = rows[:limit]
            output = ARTIFACTS / name
            output.mkdir(parents=True, exist_ok=False)
            write_json(
                output / "manifest.json",
                {
                    "device": "Windows Ryzen 7 9800X3D CPU4",
                    "freeze": frozen,
                    "data_sha256": sha256(path),
                    "source_sha256": sha256(HERE / "desktop_compare.py"),
                    "scope": "Desktop quality comparison, never reported as phone performance",
                },
            )
            records = []
            with (output / "predictions.jsonl").open("w", encoding="utf-8") as stream:
                for index, row in enumerate(rows):
                    actual = server.client.parse(row["text"], contract.context_for(row))
                    records.append({"expected": row, "actual": actual})
                    stream.write(json.dumps(records[-1], ensure_ascii=False) + "\n")
                    stream.flush()
                    if index == 0 or (index + 1) % 10 == 0:
                        print(
                            f"{name}: {index + 1}/{len(rows)}, {actual['elapsed_ms']:.0f}ms",
                            flush=True,
                        )
                    if not actual["schema_valid"]:
                        print(
                            f"Rejected: {row['id']} {actual.get('error')}", flush=True
                        )
            write_json(output / "summary.json", evaluation.summarize(records))
            analyze(records, output)
            write_json(
                output / "desktop-memory.json",
                {"peak_rss": server.peak_rss, "peak_private": server.peak_private},
            )


if __name__ == "__main__":
    main()
