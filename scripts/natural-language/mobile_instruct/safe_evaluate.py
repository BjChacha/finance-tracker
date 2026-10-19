"""Evaluate branch constraints plus escaped data with a separate manifest."""

import argparse
import json
from pathlib import Path

from runtime import (
    ARTIFACTS,
    HERE,
    analyze,
    contract,
    evaluation,
    native,
    sha256,
    write_json,
)
from safe_constraints import SafeDesktop, SafeDevice


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--desktop", action="store_true")
    ap.add_argument("--serial")
    args = ap.parse_args()
    if not args.desktop and not args.serial:
        raise ValueError("An explicit device serial is required")
    if args.serial:
        native.SERIAL = args.serial
    output = ARTIFACTS / args.output
    output.mkdir(parents=True, exist_ok=False)
    rows = evaluation.load_rows(args.data)
    write_json(
        output / "manifest.json",
        {
            "device": "desktop CPU4" if args.desktop else args.serial,
            "data_sha256": sha256(args.data),
            "source_hashes": {
                name: sha256(HERE / name)
                for name in (
                    "safe_evaluate.py",
                    "safe_constraints.py",
                    "branch_constraints.py",
                    "runtime.py",
                    "prompt.txt",
                    "device_runtime.py",
                    "desktop_compare.py",
                )
            },
            "grammar_source_sha256": sha256(HERE.parent / "instruct/harness.py"),
            "scope": "Observed-regression ablation: branch grammar and delimiter escaping; no weight or validator changes",
        },
    )
    records = []
    server = SafeDesktop() if args.desktop else SafeDevice()
    try:
        with (
            server,
            (output / "predictions.jsonl").open("w", encoding="utf-8") as stream,
        ):
            for index, row in enumerate(rows):
                actual = server.client.parse(row["text"], contract.context_for(row))
                records.append({"expected": row, "actual": actual})
                stream.write(json.dumps(records[-1], ensure_ascii=False) + "\n")
                stream.flush()
                if index == 0 or (index + 1) % 20 == 0:
                    print(f"{args.output}: {index + 1}/{len(rows)}", flush=True)
                if not actual["schema_valid"]:
                    raise RuntimeError(f"Invalid response: {actual.get('error')}")
    finally:
        if not args.desktop:
            write_json(output / "pss-samples.json", server.samples)
            write_json(output / "memory-errors.json", server.memory_errors)
            native.adb(
                "pull",
                f"{native.REMOTE}/comparison-qwen.log",
                str(output / "server.log"),
                check=False,
            )
    summary = evaluation.summarize(records)
    if not args.desktop:
        summary["device_latency_ms"] = summary.pop("observed_desktop_latency_ms")
    write_json(output / "summary.json", summary)
    analyze(records, output)


if __name__ == "__main__":
    main()
