"""Evaluate a frozen structured-generation prompt with exact prior metrics."""

import argparse
import json
import shutil
import sys
from pathlib import Path

from runtime import (
    ARTIFACTS,
    HERE,
    PhoneServer,
    analyze,
    contract,
    evaluation,
    native,
    sha256,
    write_json,
)

sys.path.insert(0, str(HERE.parent / "distribution_v1"))
from score import guard_metrics, summarize


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--no-cache", action="store_true")
    args = ap.parse_args()
    rows = evaluation.load_rows(args.data)
    if args.limit:
        rows = rows[: args.limit]
    output = ARTIFACTS / args.output
    output.mkdir(parents=True, exist_ok=False)
    source = output / "source"
    source.mkdir()
    for file in HERE.iterdir():
        if file.suffix in (".py", ".txt"):
            shutil.copy2(file, source / file.name)
    write_json(
        output / "manifest.json",
        {
            "data": str(args.data),
            "data_sha256": sha256(args.data),
            "model": json.loads((ARTIFACTS / "model-manifest.json").read_text()),
            "source_hashes": {p.name: sha256(p) for p in source.iterdir()},
            "device": "57721e63",
            "runtime": "llama.cpp b11669 CPU4, offline loopback",
            "thinking": False,
            "cache_prompt": not args.no_cache,
            "limit": args.limit,
            "review": "Observed synthetic regression, human review pending",
        },
    )
    records = []
    server = PhoneServer()
    try:
        with (
            server,
            (output / "predictions.jsonl").open("w", encoding="utf-8") as stream,
        ):
            write_json(output / "server-props.json", server.client.request("/props"))
            body = server.client.body_for(
                rows[0]["text"], contract.context_for(rows[0])
            )
            write_json(output / "first-request.json", body)
            write_json(
                output / "applied-template.json",
                server.client.request("/apply-template", body),
            )
            for index, row in enumerate(rows):
                actual = server.client.parse(
                    row["text"], contract.context_for(row), cache=not args.no_cache
                )
                record = {"expected": row, "actual": actual}
                records.append(record)
                stream.write(json.dumps(record, ensure_ascii=False) + "\n")
                stream.flush()
                print(
                    f"{index + 1}/{len(rows)} {row['id']}: {actual['elapsed_ms']:.0f}ms {actual.get('error', '')}",
                    flush=True,
                )
                if index == 0 and not actual["schema_valid"]:
                    raise RuntimeError(
                        "First request failed; inspect runtime before continuing"
                    )
    finally:
        write_json(output / "pss-samples.json", server.samples)
        write_json(output / "memory-errors.json", server.memory_errors)
        native.adb(
            "pull",
            f"{native.REMOTE}/qwen35-server.log",
            str(output / "server.log"),
            check=False,
        )
    write_json(output / "summary.json", evaluation.summarize(records))
    if all(row["expected"]["status"] == "single" for row in records):
        if {row["expected"]["type"] for row in records} == {
            "expense",
            "income",
            "transfer",
        }:
            write_json(output / "distribution-metrics.json", summarize(records))
    else:
        write_json(output / "guards.json", guard_metrics(records))
    analyze(records, output)


if __name__ == "__main__":
    main()
