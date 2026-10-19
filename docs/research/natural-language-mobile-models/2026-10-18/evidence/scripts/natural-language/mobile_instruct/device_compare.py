"""Matched local accuracy runs on the user's replacement Android device."""

import argparse
import json
import sys
from pathlib import Path

from device_runtime import DeviceServer, contract, native
from runtime import ARTIFACTS, HERE, ROOT, analyze, evaluation, sha256, write_json

sys.path.insert(0, str(HERE.parent / "distribution_v1"))
from score import guard_metrics, summarize


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--serial", required=True)
    ap.add_argument("--kind", choices=("qwen", "jev"), required=True)
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()
    native.SERIAL = args.serial
    frozen = json.loads((ARTIFACTS / "freeze.json").read_text(encoding="utf-8"))
    if any(sha256(ROOT / name) != digest for name, digest in frozen["files"].items()):
        raise ValueError("Frozen semantic configuration changed")
    output = ARTIFACTS / args.output
    output.mkdir(parents=True, exist_ok=False)
    identity = {
        name: native.adb("shell", "getprop", prop).stdout.strip()
        for name, prop in {
            "model": "ro.product.model",
            "marketname": "ro.product.marketname",
            "soc": "ro.soc.model",
            "android": "ro.build.version.release",
        }.items()
    }
    rows = evaluation.load_rows(args.data)
    if args.limit:
        rows = rows[: args.limit]
    server = DeviceServer(args.kind)
    write_json(
        output / "manifest.json",
        {
            "serial": args.serial,
            "identity": identity,
            "kind": args.kind,
            "data_sha256": sha256(args.data),
            "freeze": frozen,
            "arguments": server.arguments,
            "device_source": {
                name: sha256(HERE / name)
                for name in ("device_compare.py", "device_runtime.py")
            },
            "battery_before": native.adb("shell", "dumpsys", "battery").stdout,
            "memory_before": native.adb("shell", "cat", "/proc/meminfo").stdout,
            "model_sha256": "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4"
            if args.kind == "qwen"
            else "437710e6fe1a7c21f3b9bb7dfda5efd58cfe3c3d3bbe8fdd1dbd83302e7de18f",
            "scope": "Offline CPU4; no training; Qwen scratch batches reduced for memory, semantic prompt unchanged",
        },
    )
    records = []
    try:
        with (
            server,
            (output / "predictions.jsonl").open("w", encoding="utf-8") as stream,
        ):
            for index, row in enumerate(rows):
                actual = server.parse(row["text"], contract.context_for(row))
                records.append({"expected": row, "actual": actual})
                stream.write(json.dumps(records[-1], ensure_ascii=False) + "\n")
                stream.flush()
                if index == 0 or (index + 1) % 10 == 0:
                    print(
                        f"{args.output}: {index + 1}/{len(rows)}, {actual['elapsed_ms']:.0f}ms",
                        flush=True,
                    )
                if not actual["schema_valid"]:
                    raise RuntimeError(
                        f"Runtime/contract failure: {actual.get('error')}"
                    )
    finally:
        write_json(output / "pss-samples.json", server.samples)
        write_json(output / "memory-errors.json", server.memory_errors)
        native.adb(
            "pull",
            f"{native.REMOTE}/comparison-{args.kind}.log",
            str(output / "server.log"),
            check=False,
        )
    summary = evaluation.summarize(records)
    summary["device_latency_ms"] = summary.pop("observed_desktop_latency_ms")
    write_json(output / "summary.json", summary)
    if len({row["expected"]["type"] for row in records}) == 3 and all(
        row["expected"]["status"] == "single" for row in records
    ):
        write_json(output / "distribution.json", summarize(records))
    elif all(row["expected"]["status"] == "clarify" for row in records):
        write_json(output / "guards.json", guard_metrics(records))
    analyze(records, output)


if __name__ == "__main__":
    main()
