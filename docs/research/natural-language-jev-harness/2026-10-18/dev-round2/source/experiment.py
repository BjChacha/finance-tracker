"""Evaluate controlled variants against the same offline model and data."""

import argparse
import json

from bridge import ARTIFACTS, HERE, DeviceServer, analyze, contract, evaluation, sha256, write_json
from revision import VARIANTS, VariantParser


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(HERE.parent / "data/dev.tsv"))
    ap.add_argument("--variants", nargs="+", choices=list(VARIANTS), required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()
    rows = evaluation.load_rows(args.data)
    if args.limit:
        rows = rows[:args.limit]
    root = ARTIFACTS / args.output
    root.mkdir(parents=True, exist_ok=False)
    write_json(root / "manifest.json", {
        "arguments": vars(args),
        "data_sha256": sha256(__import__("pathlib").Path(args.data)),
        "source_hashes": {p.name: sha256(p) for p in HERE.iterdir() if p.suffix in (".py", ".json")},
        "model": "jev-qwen3-0.6b-q8_0.gguf",
        "model_sha256": "437710e6fe1a7c21f3b9bb7dfda5efd58cfe3c3d3bbe8fdd1dbd83302e7de18f",
        "device": "57721e63",
        "inference": "Offline Android CPU4, host loopback; no training",
    })
    with DeviceServer("jev-qwen3-0.6b-q8_0.gguf") as server:
        for variant in args.variants:
            output = root / variant
            output.mkdir()
            parser = VariantParser(server.encoder, variant)
            records = []
            with (output / "predictions.jsonl").open("w", encoding="utf-8") as stream:
                for row in rows:
                    parser.oracle_kind = row["type"] if variant == "oracle_type" else None
                    actual = parser.parse(row["text"], contract.context_for(row))
                    record = {"expected": row, "actual": actual}
                    records.append(record)
                    stream.write(json.dumps(record, ensure_ascii=False) + "\n")
                    stream.flush()
                    if len(records) % 20 == 0:
                        print(f"{variant}: {len(records)}/{len(rows)}", flush=True)
            summary = evaluation.summarize(records)
            summary["phone_loopback_latency_ms"] = summary.pop("observed_desktop_latency_ms")
            write_json(output / "summary.json", summary)
            analyze(records, output)
            print(json.dumps({"variant": variant, "summary": summary}), flush=True)


if __name__ == "__main__":
    main()
