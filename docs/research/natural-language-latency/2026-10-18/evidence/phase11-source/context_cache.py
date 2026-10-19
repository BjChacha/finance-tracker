"""Diagnose context changes using a frozen semantic harness and explicit waits."""

import argparse
import json
import time
from pathlib import Path

from application_context import build_context, scoring_projection
from backend import (
    ARTIFACTS,
    ROOT,
    AcceleratedServer,
    evaluation,
    native,
    sha256,
    write_json,
)
from guarded_catalog import configure_guarded_catalog
from preload import prime_context


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", required=True)
    parser.add_argument(
        "--cache-mib", type=int, choices=(512, 768, 1024), required=True
    )
    parser.add_argument("--reprime-context", action="store_true")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    freeze_file = ARTIFACTS / "catalog-freeze.json"
    freeze = json.loads(freeze_file.read_text(encoding="utf-8"))
    for name, value in freeze["files"].items():
        if sha256(ROOT / name) != value:
            raise ValueError(f"Frozen source changed: {name}")
    source = ROOT / "scripts/natural-language/distribution_v1/data/regression.tsv"
    rows = evaluation.load_rows(source)
    craft = [row for row in rows if row["context_variant"] == "craft"]
    last_craft = max(i for i, row in enumerate(rows) if row in craft)
    sequence = [rows[0], *craft[:2], rows[last_craft + 1]]
    if len(craft) < 2 or sequence[-1]["context_variant"] != "default":
        raise ValueError("Diagnostic fixture changed")
    native.SERIAL = args.serial
    output = ARTIFACTS / args.output
    output.mkdir(exist_ok=False)
    server = AcceleratedServer("HTP0", batch=512, microbatch=512, power_mode="burst")
    configure_guarded_catalog(server, sparse=True, gate_examples=True)
    server.arguments[server.arguments.index("--cache-ram") + 1] = str(args.cache_mib)
    records, waits = [], []
    manifest = {
        "serial": args.serial,
        "arguments": server.arguments,
        "cache_mib": args.cache_mib,
        "reprime_context": args.reprime_context,
        "candidate_freeze_sha256": sha256(freeze_file),
        "source_sha256": sha256(source),
        "runner_sha256": sha256(Path(__file__)),
        "scope": "Four observed context-transition diagnostics, not independent accuracy or UI timing",
    }
    try:
        with (
            server,
            (output / "predictions.jsonl").open("w", encoding="utf-8") as stream,
        ):
            previous = None
            for row in sequence:
                fixture = build_context(row)
                variant = row["context_variant"]
                if previous is None or (args.reprime_context and previous != variant):
                    started = time.perf_counter()
                    result = prime_context(server.client, fixture["context"])
                    waits.append(
                        {"before_id": row["id"], "variant": variant, "priming": result}
                    )
                    print(
                        "context_wait",
                        variant,
                        (time.perf_counter() - started) * 1000,
                        flush=True,
                    )
                actual = server.client.parse(row["text"], fixture["context"])
                record = {
                    "expected": row,
                    "actual": actual,
                    "scoring_actual": scoring_projection(actual, fixture),
                }
                records.append(record)
                stream.write(json.dumps(record, ensure_ascii=False) + "\n")
                stream.flush()
                print(row["id"], actual["elapsed_ms"], flush=True)
                previous = variant
            manifest["load_ms"] = server.load_ms
    finally:
        manifest["environment"] = getattr(server, "environment", {})
        write_json(output / "manifest.json", manifest)
        write_json(output / "preload.json", waits)
        write_json(output / "pss-samples.json", server.samples)
        write_json(output / "memory-errors.json", server.memory_errors)
        server.collect_log(output / "server.log")
    summary = evaluation.summarize(
        [{"expected": r["expected"], "actual": r["scoring_actual"]} for r in records]
    )
    summary["native_request_latency_ms"] = summary.pop("observed_desktop_latency_ms")
    write_json(output / "summary.json", summary)


if __name__ == "__main__":
    main()
