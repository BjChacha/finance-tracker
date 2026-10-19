"""Capture a process-cold load and requests with a device scheduler trace."""

import argparse
import os
import subprocess
import time
from pathlib import Path

from backend import (
    ARTIFACTS,
    MODEL,
    AcceleratedServer,
    contract,
    evaluation,
    native,
    sha256,
    write_json,
)
from lean import LeanClient


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", required=True)
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--device", choices=("HTP0", "GPUOpenCL"), default="HTP0")
    parser.add_argument("--output", required=True)
    parser.add_argument("--prewarm", action="store_true")
    parser.add_argument("--application-seed", action="store_true")
    args = parser.parse_args()
    native.SERIAL = args.serial
    output = ARTIFACTS / args.output
    output.mkdir(parents=True, exist_ok=False)
    server = AcceleratedServer(args.device, args.model, 512, 512)
    server.client = LeanClient(server.port)
    fixture = None
    if args.application_seed:
        from aliases import AliasLeanClient
        from application_context import build_context

        fixture = build_context({"context_variant": "default"})
        server.client = AliasLeanClient(server.port)
        write_json(output / "context.json", fixture)
    server.arguments.extend(["-lv", "4"])
    remote_trace = f"/data/misc/perfetto-traces/{args.output}.pb"
    manifest = {
        "serial": args.serial,
        "model": args.model,
        "device": args.device,
        "prewarm": args.prewarm,
        "application_seed": args.application_seed,
        "arguments": server.arguments,
        "scope": "Single process-cold diagnostic, OS caches retained; no UI",
        "battery_before": native.adb("shell", "dumpsys", "battery").stdout,
    }
    rows = evaluation.load_rows(
        Path(__file__).resolve().parent.parent / "distribution_v1/data/dev.tsv"
    )[:3]
    sources = output / "source"
    sources.mkdir()
    for name in (
        "profile_cold.py",
        "backend.py",
        "lean.py",
        "compact.py",
        "aliases.py",
        "application_context.py",
        "preload.py",
    ):
        source = Path(__file__).resolve().parent / name
        (sources / name).write_bytes(source.read_bytes())
    manifest["source_hashes"] = {p.name: sha256(p) for p in sources.iterdir()}
    with (output / "perfetto.log").open("wb") as log:
        trace = subprocess.Popen(
            [
                str(native.ADB),
                "-s",
                args.serial,
                "shell",
                "perfetto",
                "-o",
                remote_trace,
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
            stdout=log,
            stderr=log,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        time.sleep(1)
        try:
            with server:
                manifest["pid"] = server.pid
                manifest["load_ms"] = server.load_ms
                manifest["environment"] = server.environment
                print("model_ready", server.load_ms, flush=True)
                if args.prewarm:
                    from preload import prime_context

                    context = (
                        fixture["context"] if fixture else contract.context_for(rows[0])
                    )
                    priming = prime_context(server.client, context)
                    write_json(output / "preload.json", priming)
                    manifest["ready_ms"] = (time.perf_counter() - server.started) * 1000
                    print("context_ready", manifest["ready_ms"], flush=True)
                results = []
                for row in rows:
                    context = (
                        fixture["context"] if fixture else contract.context_for(row)
                    )
                    result = server.client.parse(row["text"], context)
                    results.append({"expected": row, "actual": result})
                    print(
                        "request", result["elapsed_ms"], result["decision"], flush=True
                    )
                    if len(results) == 1:
                        manifest["first_result_ms"] = (
                            time.perf_counter() - server.started
                        ) * 1000
                write_json(output / "predictions.json", results)
        finally:
            trace.wait(timeout=35)
            native.adb("pull", remote_trace, str(output / "trace.pb"))
            server.collect_log(output / "server.log")
            manifest["battery_after"] = native.adb("shell", "dumpsys", "battery").stdout
            write_json(output / "manifest.json", manifest)
            write_json(output / "pss-samples.json", server.samples)
            write_json(output / "memory-errors.json", server.memory_errors)


if __name__ == "__main__":
    main()
