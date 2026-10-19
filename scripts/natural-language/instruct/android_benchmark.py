"""Isolated Android runtime measurements, with process-cold and warm runs."""

import argparse
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
from pathlib import Path

from fetch import ARTIFACTS
from harness import default_context
from runner import Client

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import HERE as LEGACY
from common import write_json

ADB = Path.home() / "AppData/Local/Android/Sdk/platform-tools/adb.exe"
SERIAL = "57721e63"
REMOTE = "/data/local/tmp/finance-nl-bench"
TRACE = "/data/misc/perfetto-traces/finance-nl-instruct.pb"


def adb(*args, check=True):
    return subprocess.run(
        [str(ADB), "-s", SERIAL, *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=30,
        check=check,
    )


class AndroidServer:
    def __init__(self, model="model-q2.gguf", port=18462):
        if re.fullmatch(r"[A-Za-z0-9_.-]+", model) is None:
            raise ValueError("Invalid remote filename")
        self.model, self.port = model, port
        self.client = Client(port)
        self.pid = None
        self.samples = []
        self.memory_errors = []
        self.stop_sampling = threading.Event()
        self.forwarded = False

    def sample(self):
        while not self.stop_sampling.is_set():
            try:
                result = adb(
                    "shell", "cat", f"/proc/{self.pid}/smaps_rollup", check=False
                )
                match = re.search(r"^Pss:\s+(\d+) kB", result.stdout, re.MULTILINE)
                if match:
                    self.samples.append(
                        {
                            "elapsed_ms": (time.perf_counter() - self.started) * 1000,
                            "pss_kib": int(match.group(1)),
                        }
                    )
                elif result.returncode:
                    self.memory_errors.append(result.stderr.strip())
            except (OSError, subprocess.SubprocessError) as error:
                self.memory_errors.append(str(error))
            self.stop_sampling.wait(0.2)

    def __enter__(self):
        adb("forward", "--no-rebind", f"tcp:{self.port}", f"tcp:{self.port}")
        self.forwarded = True
        self.started = time.perf_counter()
        try:
            command = f"cd {REMOTE}; LD_LIBRARY_PATH=runtime runtime/llama-server -m {self.model} --host 127.0.0.1 --port {self.port} -c 4096 -t 4 -tb 4 -np 1 -ngl 0 --no-webui --no-warmup --no-context-shift > benchmark-server.log 2>&1 & echo $!"
            self.pid = adb("shell", command).stdout.strip()
            if not self.pid.isdecimal():
                raise RuntimeError("Missing server PID")
            self.thread = threading.Thread(target=self.sample, daemon=True)
            self.thread.start()
            while time.perf_counter() - self.started < 45:
                try:
                    if self.client.request("/health", timeout=1).get("status") == "ok":
                        self.load_ms = (time.perf_counter() - self.started) * 1000
                        return self
                except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
                    self.last_health_error = str(error)
                time.sleep(0.1)
            raise TimeoutError("Android server did not become healthy")
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def __exit__(self, *_):
        self.stop_sampling.set()
        if hasattr(self, "thread"):
            self.thread.join(timeout=5)
        if self.pid and self.pid.isdecimal():
            adb("shell", "kill", self.pid, check=False)
        if self.forwarded:
            adb("forward", "--remove", f"tcp:{self.port}", check=False)
        self.forwarded = False


def percentile(values, percent):
    if not values:
        return None
    values = sorted(values)
    rank = (len(values) - 1) * percent / 100
    low, high = int(rank), min(int(rank) + 1, len(values) - 1)
    return values[low] + (values[high] - values[low]) * (rank - low)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="model-q2.gguf")
    parser.add_argument("--output", required=True)
    parser.add_argument("--cold-runs", type=int, default=20)
    parser.add_argument("--warm-runs", type=int, default=60)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--data", default=str(LEGACY / "data" / "dev.tsv"))
    parser.add_argument("--trace", action="store_true")
    args = parser.parse_args()
    import csv

    with Path(args.data).open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream, delimiter="\t"))
    output = ARTIFACTS / "reports" / args.output
    output.mkdir(parents=True, exist_ok=False)
    identity = {
        name: adb("shell", "getprop", prop).stdout.strip()
        for name, prop in {
            "model": "ro.product.model",
            "soc": "ro.soc.model",
            "android": "ro.build.version.release",
            "abi": "ro.product.cpu.abi",
        }.items()
    }
    battery_before = adb("shell", "dumpsys", "battery").stdout
    context = default_context()
    cold, warm, all_samples, memory_errors = [], [], [], []
    trace_process = None
    trace_log = None
    with (output / "measurements.jsonl").open("w", encoding="utf-8") as stream:
        for index in range(args.cold_runs):
            text = rows[index % len(rows)]["text"]
            with AndroidServer(args.model) as server:
                actual = server.client.parse(
                    text, context, examples=False, cache=False, prompt_file=args.prompt
                )
                total_ms = (time.perf_counter() - server.started) * 1000
                observation = {
                    "phase": "process_cold",
                    "index": index,
                    "pid": server.pid,
                    "load_ms": server.load_ms,
                    "total_ms": total_ms,
                    "actual": actual,
                }
                cold.append(observation)
                stream.write(json.dumps(observation, ensure_ascii=False) + "\n")
                stream.flush()
            all_samples.extend(
                {**sample, "phase": "process_cold", "run": index, "pid": server.pid}
                for sample in server.samples
            )
            memory_errors.extend(server.memory_errors)
            print(f"Cold {index + 1}/{args.cold_runs}: {total_ms:.0f} ms", flush=True)
        with AndroidServer(args.model) as server:
            server.client.parse(
                rows[0]["text"],
                context,
                examples=False,
                cache=True,
                prompt_file=args.prompt,
            )
            if args.trace:
                trace_log = (output / "perfetto.log").open("wb")
                trace_process = subprocess.Popen(
                    [
                        str(ADB),
                        "-s",
                        SERIAL,
                        "shell",
                        "perfetto",
                        "-o",
                        TRACE,
                        "-t",
                        "20s",
                        "sched",
                        "freq",
                        "idle",
                        "am",
                        "wm",
                        "view",
                        "gfx",
                    ],
                    stdout=trace_log,
                    stderr=trace_log,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                )
            for index in range(args.warm_runs):
                text = rows[(index + 1) % len(rows)]["text"]
                actual = server.client.parse(
                    text, context, examples=False, cache=True, prompt_file=args.prompt
                )
                observation = {
                    "phase": "warm",
                    "index": index,
                    "pid": server.pid,
                    "actual": actual,
                }
                warm.append(observation)
                stream.write(json.dumps(observation, ensure_ascii=False) + "\n")
                stream.flush()
                if (index + 1) % 10 == 0:
                    print(f"Warm {index + 1}/{args.warm_runs}", flush=True)
        all_samples.extend(
            {**sample, "phase": "warm", "pid": server.pid} for sample in server.samples
        )
        memory_errors.extend(server.memory_errors)
    write_json(output / "pss-samples.json", all_samples)
    if trace_process:
        trace_process.wait(timeout=25)
        trace_log.close()
        trace_result = adb("pull", TRACE, str(output / "warm-trace.pb"), check=False)
        write_json(
            output / "trace-status.json",
            {
                "exit_code": trace_process.returncode,
                "pull_exit_code": trace_result.returncode,
                "pull_error": trace_result.stderr,
            },
        )
    peak = max((row["pss_kib"] for row in all_samples), default=None)
    result = {
        "device": identity,
        "model": args.model,
        "configuration": vars(args),
        "cold_process_p95_ms": percentile([row["total_ms"] for row in cold], 95),
        "warm_p95_ms": percentile([row["actual"]["elapsed_ms"] for row in warm], 95),
        "isolated_runtime_peak_pss_bytes": peak * 1024 if peak is not None else None,
        "memory_sample_count": len(all_samples),
        "memory_errors": memory_errors,
        "cold_schema_successes": sum(row["actual"]["schema_valid"] for row in cold),
        "warm_schema_successes": sum(row["actual"]["schema_valid"] for row in warm),
        "battery_before": battery_before,
        "battery_after": adb("shell", "dumpsys", "battery").stdout,
        "scope": [
            "Native isolated llama.cpp process, not integrated React Native application.",
            "Cold resets process/model/KV cache, does not flush Android filesystem page cache.",
            "Warm keeps model loaded and allows shared-prefix prompt cache; inputs vary.",
            "PSS is total process PSS sampled every 200ms plus adb collection time; short peaks can be missed.",
            "Client elapsed includes USB-forwarded loopback request and host-side deterministic validation.",
        ],
    }
    write_json(output / "summary.json", result)
    write_json(output / "pss-samples.json", all_samples)
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
