"""Post-regression structural ablation, never presented as an unseen test."""

import argparse
import json
from pathlib import Path

from branch_constraints import BranchDesktop, BranchDevice
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--desktop", action="store_true")
    ap.add_argument("--serial")
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()
    if not args.desktop and not args.serial:
        raise ValueError("An explicit device serial is required")
    if args.serial:
        native.SERIAL = args.serial
    output = ARTIFACTS / args.output
    output.mkdir(parents=True, exist_ok=False)
    rows = evaluation.load_rows(args.data)
    if args.limit:
        rows = rows[: args.limit]
    metadata = {
        "device": "desktop CPU4" if args.desktop else args.serial,
        "data_sha256": sha256(args.data),
        "source_hashes": {
            name: sha256(HERE / name)
            for name in (
                "branch_evaluate.py",
                "branch_constraints.py",
                "runtime.py",
                "prompt.txt",
                "device_runtime.py",
                "desktop_compare.py",
            )
        },
        "grammar_source_sha256": sha256(HERE.parent / "instruct/harness.py"),
        "scope": "Observed-regression structural ablation. Existing frozen branch grammar, no prompt/model/validator changes",
    }
    write_json(output / "manifest.json", metadata)
    records = []
    server = BranchDesktop() if args.desktop else BranchDevice()
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
                    raise RuntimeError(
                        f"Invalid structured response: {actual.get('error')}"
                    )
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
