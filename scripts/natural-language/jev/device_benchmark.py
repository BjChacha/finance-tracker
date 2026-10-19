"""Measure the isolated CPU embedding runtime on the authorized Android device."""

import argparse
import json
import os
import re
import shlex
import subprocess
import threading
import time
import urllib.error

from decision import DecisionParser
from encoder import LoopbackEncoder, server_arguments
from support import (
    ARTIFACTS,
    HERE,
    baseline_evaluate,
    baseline_harness,
    write_json,
)
from support import (
    baseline_android as native,
)

TRACE = "/data/misc/perfetto-traces/finance-nl-jev.pb"


class DeviceServer(native.AndroidServer):
    def __init__(self, model, port=18472):
        super().__init__(model, port)
        self.encoder = LoopbackEncoder(port)

    def __enter__(self):
        native.adb("forward", "--no-rebind", f"tcp:{self.port}", f"tcp:{self.port}")
        self.forwarded = True
        self.started = time.perf_counter()
        try:
            arguments = shlex.join(server_arguments(self.model, self.port))
            command = (
                f"cd {native.REMOTE}; LD_LIBRARY_PATH=runtime runtime/llama-server "
                f"{arguments} > jev-server.log 2>&1 & echo $!"
            )
            self.pid = native.adb("shell", command).stdout.strip()
            if re.fullmatch(r"[0-9]+", self.pid) is None:
                raise RuntimeError("Missing owned server PID")
            self.thread = threading.Thread(target=self.sample, daemon=True)
            self.thread.start()
            while time.perf_counter() - self.started < 90:
                try:
                    if self.encoder.request("/health", timeout=1).get("status") == "ok":
                        self.load_ms = (time.perf_counter() - self.started) * 1000
                        return self
                except (urllib.error.URLError, TimeoutError, ConnectionError):
                    pass
                time.sleep(0.1)
            raise TimeoutError("Android embedding server startup timed out")
        except BaseException:
            self.__exit__(None, None, None)
            raise


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--cold-runs", type=int, default=20)
    ap.add_argument("--warm-runs", type=int, default=60)
    ap.add_argument("--trace", action="store_true")
    args = ap.parse_args()
    output = ARTIFACTS / "reports" / args.output
    output.mkdir(parents=True, exist_ok=False)
    rows = baseline_evaluate.load_rows(HERE.parent / "data/dev.tsv")
    identity = {
        key: native.adb("shell", "getprop", prop).stdout.strip()
        for key, prop in {
            "model": "ro.product.model",
            "soc": "ro.soc.model",
            "android": "ro.build.version.release",
            "abi": "ro.product.cpu.abi",
        }.items()
    }
    battery_before = native.adb("shell", "dumpsys", "battery").stdout
    cold, warm, samples, errors = [], [], [], []
    trace_process = None
    trace_log = None

    def collect(server, phase, index=None):
        samples.extend(
            {**row, "phase": phase, "run": index, "pid": server.pid}
            for row in server.samples
        )
        errors.extend(server.memory_errors)
        write_json(output / "pss-samples.json", samples)

    try:
        with (output / "measurements.jsonl").open("w", encoding="utf-8") as stream:
            for index in range(args.cold_runs):
                row = rows[index % len(rows)]
                with DeviceServer(args.model) as server:
                    parser = DecisionParser(server.encoder)
                    actual = parser.parse(
                        row["text"], baseline_harness.context_for(row)
                    )
                    total = (time.perf_counter() - server.started) * 1000
                    observation = {
                        "phase": "process_cold",
                        "index": index,
                        "pid": server.pid,
                        "load_ms": server.load_ms,
                        "total_ms": total,
                        "actual": actual,
                    }
                    cold.append(observation)
                    stream.write(json.dumps(observation, ensure_ascii=False) + "\n")
                    stream.flush()
                collect(server, "process_cold", index)
                print(f"Cold {index + 1}/{args.cold_runs}: {total:.0f} ms", flush=True)
            with DeviceServer(args.model) as server:
                parser = DecisionParser(server.encoder)
                # Only one warm-up transaction; unseen candidate vectors still count in timed runs.
                parser.parse(rows[0]["text"], baseline_harness.context_for(rows[0]))
                if args.trace:
                    trace_log = (output / "perfetto.log").open("wb")
                    trace_process = subprocess.Popen(
                        [
                            str(native.ADB),
                            "-s",
                            native.SERIAL,
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
                        creationflags=subprocess.CREATE_NO_WINDOW
                        if os.name == "nt"
                        else 0,
                    )
                for index in range(args.warm_runs):
                    row = rows[(index + 1) % len(rows)]
                    actual = parser.parse(
                        row["text"], baseline_harness.context_for(row)
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
                write_json(
                    output / "document-cache.json",
                    {
                        "count": len(parser.document_cache),
                        "float32_payload_bytes": len(parser.document_cache) * 1024 * 4,
                        "scope": "Host-side prototype cache; Python object overhead excluded from this payload count",
                    },
                )
            collect(server, "warm")
    finally:
        if trace_process is not None:
            try:
                trace_process.wait(timeout=30)
            finally:
                if trace_process.poll() is None:
                    trace_process.terminate()
                    trace_process.wait(timeout=5)
                trace_log.close()
            pulled = native.adb(
                "pull", TRACE, str(output / "warm-trace.pb"), check=False
            )
            write_json(
                output / "trace-status.json",
                {
                    "exit_code": trace_process.returncode,
                    "pull_exit_code": pulled.returncode,
                    "pull_error": pulled.stderr,
                },
            )
    peak = max((row["pss_kib"] for row in samples), default=None)
    summary = {
        "device": identity,
        "configuration": vars(args),
        "cold_process_p95_ms": native.percentile([row["total_ms"] for row in cold], 95),
        "warm_p95_ms": native.percentile(
            [row["actual"]["elapsed_ms"] for row in warm], 95
        ),
        "isolated_runtime_peak_pss_bytes": peak * 1024 if peak is not None else None,
        "memory_sample_count": len(samples),
        "memory_errors": errors,
        "cold_schema_successes": sum(row["actual"]["schema_valid"] for row in cold),
        "warm_schema_successes": sum(row["actual"]["schema_valid"] for row in warm),
        "battery_before": battery_before,
        "battery_after": native.adb("shell", "dumpsys", "battery").stdout,
        "scope": [
            "Isolated native CPU runtime, four threads; not React Native incremental PSS.",
            "Process-cold includes loading and all candidate embeddings; OS file cache is not flushed.",
            "Warm caches candidate documents only; query embeddings are recomputed for every request.",
            "One warm-up input; new or changed category/account/amount candidates are charged to timed requests.",
            "Host orchestration, scoring, validation and USB forwarding are included in request latency.",
            "Host candidate cache and Python interpreter memory are excluded from device PSS.",
            "PSS sampled every 200ms plus adb time; shorter peaks can be missed.",
        ],
    }
    write_json(output / "summary.json", summary)
    print(json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
