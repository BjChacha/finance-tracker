"""Evaluate unchanged comparison data through the local JevEmbed decision adapter."""

import argparse
import json
from contextlib import nullcontext
from pathlib import Path

from decision import DecisionParser
from encoder import EmbeddingServer, ReferenceEncoder
from support import (
    ARTIFACTS,
    HERE,
    BackendError,
    baseline_evaluate,
    baseline_harness,
    read_json,
    sha256,
    write_json,
)


def evaluate(encoder, rows, output, prompts=None):
    parser = DecisionParser(encoder, prompts)
    records = []
    with (output / "predictions.jsonl").open("w", encoding="utf-8") as stream:
        for expected in rows:
            try:
                actual = parser.parse(
                    expected["text"], baseline_harness.context_for(expected)
                )
            except (
                ValueError,
                OSError,
                TimeoutError,
                RuntimeError,
                BackendError,
            ) as error:
                actual = {"schema_valid": False, "error": str(error)}
            record = {"expected": expected, "actual": actual}
            records.append(record)
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")
            stream.flush()
            if len(records) % 10 == 0:
                print(f"Evaluated {len(records)}/{len(rows)}", flush=True)
    summary = baseline_evaluate.summarize(records)
    write_json(output / "summary.json", summary)
    return summary


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model")
    ap.add_argument("--reference", action="store_true")
    ap.add_argument("--data", default=str(HERE.parent / "data/dev.tsv"))
    ap.add_argument("--output", required=True)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--prompts")
    ap.add_argument("--port", type=int, default=18471)
    ap.add_argument("--device", action="store_true")
    args = ap.parse_args()
    if args.reference == bool(args.model):
        ap.error("Select exactly one of --reference and --model")
    if args.device and args.reference:
        ap.error("The Python reference runs on the host, not the Android device")
    rows = baseline_evaluate.load_rows(args.data)
    if args.limit:
        rows = rows[: args.limit]
    output = ARTIFACTS / "reports" / args.output
    output.mkdir(parents=True, exist_ok=False)
    if args.device:
        from device_benchmark import DeviceServer

        manager = DeviceServer(args.model)
    else:
        manager = (
            nullcontext() if args.reference else EmbeddingServer(args.model, args.port)
        )
    with manager as server:
        encoder = ReferenceEncoder() if args.reference else server.encoder
        summary = evaluate(
            encoder, rows, output, read_json(args.prompts) if args.prompts else None
        )
    if args.device:
        summary["observed_phone_loopback_latency_ms"] = summary.pop(
            "observed_desktop_latency_ms"
        )
        write_json(output / "summary.json", summary)
    model_path = (
        ARTIFACTS / "models" / args.model
        if args.device
        else Path(args.model)
        if args.model
        else None
    )
    write_json(
        output / "manifest.json",
        {
            "configuration": vars(args),
            "data_sha256": sha256(Path(args.data)),
            "source_files": {
                path.name: sha256(path)
                for path in HERE.iterdir()
                if path.suffix in (".py", ".json")
            },
            "model_sha256": sha256(model_path) if model_path else None,
            "model_bytes": model_path.stat().st_size if model_path else None,
            "inference": "CPU only; loopback or local_files_only; no online inference",
        },
    )
    print(json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
