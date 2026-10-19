"""Measure process-cold and varying-input warm requests with PSS and Perfetto."""

import argparse
import json
import os
import subprocess
import time
from pathlib import Path

from runtime import ARTIFACTS, PhoneServer, contract, evaluation, native, write_json


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--cold-runs", type=int, default=5)
    ap.add_argument("--warm-runs", type=int, default=20)
    args = ap.parse_args()
    rows = evaluation.load_rows(args.data)
    output = ARTIFACTS / args.output
    output.mkdir(parents=True, exist_ok=False)
    samples, errors, cold, warm = [], [], [], []
    before = native.adb("shell", "dumpsys", "battery").stdout
    trace_path = "/data/misc/perfetto-traces/finance-qwen35-warm.pb"
    trace_process = None
    trace_log = None

    def collect(server, phase, index):
        samples.extend(
            {**s, "phase": phase, "run": index, "pid": server.pid}
            for s in server.samples
        )
        errors.extend(server.memory_errors)
        write_json(output / "pss-samples.json", samples)

    try:
        with (output / "measurements.jsonl").open("w", encoding="utf-8") as stream:
            for index in range(args.cold_runs):
                row = rows[index]
                server = PhoneServer()
                try:
                    with server:
                        actual = server.client.parse(
                            row["text"], contract.context_for(row), cache=False
                        )
                        item = {
                            "phase": "process_cold",
                            "index": index,
                            "pid": server.pid,
                            "load_ms": server.load_ms,
                            "total_ms": (time.perf_counter() - server.started) * 1000,
                            "actual": actual,
                        }
                        cold.append(item)
                        stream.write(json.dumps(item, ensure_ascii=False) + "\n")
                        stream.flush()
                        print(f"cold {index + 1}: {item['total_ms']:.0f}ms", flush=True)
                finally:
                    collect(server, "process_cold", index)
            server = PhoneServer()
            try:
                with server:
                    primer = server.client.parse(
                        rows[0]["text"], contract.context_for(rows[0])
                    )
                    write_json(output / "warm-primer.json", primer)
                    trace_log = (output / "perfetto.log").open("wb")
                    trace_process = subprocess.Popen(
                        [
                            str(native.ADB),
                            "-s",
                            native.SERIAL,
                            "shell",
                            "perfetto",
                            "-o",
                            trace_path,
                            "-t",
                            "30s",
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
                        row = rows[index + 1]
                        actual = server.client.parse(
                            row["text"], contract.context_for(row)
                        )
                        item = {
                            "phase": "warm",
                            "index": index,
                            "pid": server.pid,
                            "actual": actual,
                        }
                        warm.append(item)
                        stream.write(json.dumps(item, ensure_ascii=False) + "\n")
                        stream.flush()
                        print(
                            f"warm {index + 1}: {actual['elapsed_ms']:.0f}ms",
                            flush=True,
                        )
            finally:
                collect(server, "warm", None)
    finally:
        if trace_process:
            trace_process.wait(timeout=35)
            trace_log.close()
            native.adb("pull", trace_path, str(output / "warm-trace.pb"))
        write_json(output / "memory-errors.json", errors)
    write_json(
        output / "summary.json",
        {
            "cold_runs": len(cold),
            "warm_runs": len(warm),
            "process_cold_p95_ms": evaluation.percentile(
                [r["total_ms"] for r in cold], 95
            ),
            "warm_p95_ms": evaluation.percentile(
                [r["actual"]["elapsed_ms"] for r in warm], 95
            ),
            "peak_pss_bytes": max(s["pss_kib"] for s in samples) * 1024,
            "memory_sample_count": len(samples),
            "memory_errors": errors,
            "schema_valid": sum(r["actual"]["schema_valid"] for r in cold + warm),
            "battery_before": before,
            "battery_after": native.adb("shell", "dumpsys", "battery").stdout,
            "scope": [
                "CPU4, isolated native process, not React Native incremental PSS",
                "Cold restarts model/process/KV, leaves OS filesystem cache intact",
                "Warm shared system prefix cache, varied inputs; includes USB loopback",
                "Exploratory 5/20 sample budget, not matched to previous 20/60 sample count",
                "PSS sampled every 200ms plus adb overhead; short peaks can be missed",
            ],
        },
    )


if __name__ == "__main__":
    main()
