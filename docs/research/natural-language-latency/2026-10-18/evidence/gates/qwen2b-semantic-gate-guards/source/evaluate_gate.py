"""Measure an isolated semantic gate before composing it with field extraction."""

import argparse
import json
import shutil
import time
from pathlib import Path

from backend import (
    ARTIFACTS,
    HERE,
    MODEL,
    AcceleratedServer,
    contract,
    evaluation,
    native,
    sha256,
    write_json,
)
from semantic_gate import SemanticGateClient


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", required=True)
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--template", default="qwen35-official-template.jinja")
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    native.SERIAL = args.serial
    output = ARTIFACTS / args.output
    output.mkdir(exist_ok=False)
    rows = (
        json.loads(args.data.read_text(encoding="utf-8"))
        if args.data.suffix == ".json"
        else evaluation.load_rows(args.data)
    )
    if args.limit:
        rows = rows[: args.limit]
    if len({row["id"] for row in rows}) != len(rows):
        raise ValueError("Expected unique input IDs")
    source = output / "source"
    source.mkdir()
    for name in (
        "evaluate_gate.py",
        "semantic_gate.py",
        "gate_prompt.txt",
        "backend.py",
    ):
        shutil.copyfile(HERE / name, source / name)
    server = AcceleratedServer(
        "HTP0", args.model, batch=512, microbatch=512, template=args.template
    )
    server.client = SemanticGateClient(server.port)
    manifest = {
        "serial": args.serial,
        "model": args.model,
        "arguments": server.arguments,
        "data_sha256": sha256(args.data),
        "source_hashes": {p.name: sha256(p) for p in source.iterdir()},
        "scope": "Isolated local semantic gate, not field accuracy or application latency",
    }
    write_json(output / "manifest.json", manifest)
    records = []
    started = time.perf_counter()
    try:
        with (
            server,
            (output / "predictions.jsonl").open("w", encoding="utf-8") as stream,
        ):
            for row in rows:
                context = contract.context_for(
                    {"context_variant": row.get("context_variant", "default")}
                )
                result = server.client.parse(row["text"], context)
                records.append({"expected": row, "actual": result})
                stream.write(json.dumps(records[-1], ensure_ascii=False) + "\n")
                stream.flush()
                if len(records) == 1:
                    manifest.update(
                        load_ms=server.load_ms,
                        process_cold_first_result_ms=(time.perf_counter() - started)
                        * 1000,
                    )
                print(row["id"], result["status"], result["elapsed_ms"], flush=True)
    finally:
        manifest["environment"] = getattr(server, "environment", {})
        write_json(output / "manifest.json", manifest)
        write_json(output / "pss-samples.json", server.samples)
        write_json(output / "memory-errors.json", server.memory_errors)
        native.adb(
            "pull",
            f"{native.REMOTE}/{server.log}",
            str(output / "server.log"),
            check=False,
        )
    times = [row["actual"]["elapsed_ms"] for row in records]
    write_json(
        output / "gate-summary.json",
        {
            "total": len(records),
            "schema_valid": sum(row["actual"]["schema_valid"] for row in records),
            "status_correct": sum(
                row["expected"]["status"] == row["actual"]["status"] for row in records
            ),
            "false_single": [
                row["expected"]["id"]
                for row in records
                if row["expected"]["status"] == "clarify"
                and row["actual"]["status"] == "single"
            ],
            "false_clarify": [
                row["expected"]["id"]
                for row in records
                if row["expected"]["status"] == "single"
                and row["actual"]["status"] == "clarify"
            ],
            "native_gate_latency_ms": {
                "p50": evaluation.percentile(times, 50),
                "p95": evaluation.percentile(times, 95),
                "max": max(times),
            },
        },
    )


if __name__ == "__main__":
    main()
