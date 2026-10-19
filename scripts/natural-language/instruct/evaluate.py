"""Evaluate raw structure, business validity and semantic accuracy separately."""

import argparse
import csv
import json
import statistics
import sys
from pathlib import Path

from fetch import ARTIFACTS, sha256
from harness import context_for
from runner import DesktopServer

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import HERE as LEGACY
from common import write_json


def load_rows(path):
    with Path(path).open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream, delimiter="\t"))
    for index, row in enumerate(rows):
        row["id"] = row.get("id") or f"{Path(path).stem}-{index + 1:03d}"
        row["amount_cents"] = int(row["amount_cents"]) if row["amount_cents"] else None
    return rows


def percentile(values, percent):
    if not values:
        return None
    values = sorted(values)
    rank = (len(values) - 1) * percent / 100
    lo, hi = int(rank), min(int(rank) + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (rank - lo)


def summarize(records):
    singles = [row for row in records if row["expected"]["status"] == "single"]
    guards = [row for row in records if row["expected"]["status"] == "clarify"]
    result = {
        "total": len(records),
        "schema_valid": sum(
            row["actual"].get("schema_valid", False) for row in records
        ),
        "business_consistent": sum(
            row["actual"].get("schema_valid", False)
            and not row["actual"]["validated"]["violations"]
            for row in records
        ),
        "preview_ready": sum(
            (row["actual"].get("validated") or {}).get("status") == "preview"
            for row in records
        ),
        "semantics": {},
    }
    for key, target in (("amount_cents", 0.99), ("type", 0.95), ("category", 0.90)):
        raw_correct = sum(
            (row["actual"].get("validated") or {}).get(key) == row["expected"][key]
            for row in singles
        )
        correct = sum(
            row["actual"].get("schema_valid", False)
            and (row["actual"].get("decision") or {}).get("status") == "single"
            and not row["actual"]["validated"]["violations"]
            and row["actual"]["validated"].get(key) == row["expected"][key]
            for row in singles
        )
        result["semantics"][key] = {
            "correct": correct,
            "raw_field_correct_diagnostic": raw_correct,
            "total": len(singles),
            "accuracy": correct / len(singles) if singles else None,
            "target": target,
            "passed": bool(singles and correct / len(singles) >= target),
        }
    result["needs_manual_input"] = sum(
        (row["actual"].get("validated") or {}).get("status") != "preview"
        for row in records
    )
    result["auxiliary"] = {}
    for key in ("account", "to_account", "day"):
        annotated = [row for row in singles if key in row["expected"]]
        hits = sum(
            row["actual"].get("schema_valid", False)
            and (row["actual"].get("decision") or {}).get(key)
            == (row["expected"][key] or None)
            for row in annotated
        )
        result["auxiliary"][key] = {"raw_correct": hits, "total": len(annotated)}
    result["guards"] = {
        "total": len(guards),
        "correct_abstentions": sum(
            (row["actual"].get("decision") or {}).get("status") == "clarify"
            for row in guards
        ),
        "false_single": sum(
            (row["actual"].get("decision") or {}).get("status") == "single"
            for row in guards
        ),
        "clear_single_accepted": sum(
            (row["actual"].get("decision") or {}).get("status") == "single"
            for row in singles
        ),
        "clear_single_total": len(singles),
    }
    durations = [
        row["actual"]["elapsed_ms"] for row in records if "elapsed_ms" in row["actual"]
    ]
    result["observed_desktop_latency_ms"] = {
        "p50": statistics.median(durations) if durations else None,
        "p95": percentile(durations, 95),
        "count": len(durations),
    }
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--data", default=str(LEGACY / "data" / "dev.tsv"))
    parser.add_argument("--output", required=True)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--unconstrained", action="store_true")
    parser.add_argument("--no-examples", action="store_true")
    parser.add_argument("--cache", action="store_true")
    parser.add_argument("--prompt")
    args = parser.parse_args()
    rows = load_rows(args.data)
    if args.limit:
        rows = rows[: args.limit]
    records = []
    output = ARTIFACTS / "reports" / args.output
    output.mkdir(parents=True, exist_ok=False)
    with (
        (output / "predictions.jsonl").open("w", encoding="utf-8") as stream,
        DesktopServer(args.model) as server,
    ):
        for expected in rows:
            context = context_for(expected)
            try:
                actual = server.client.parse(
                    expected["text"],
                    context,
                    constrained=not args.unconstrained,
                    examples=not args.no_examples,
                    cache=args.cache,
                    prompt_file=args.prompt,
                )
            except (OSError, ValueError, TypeError, TimeoutError) as error:
                actual = {"schema_valid": False, "error": str(error)}
            record = {"expected": expected, "actual": actual}
            records.append(record)
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")
            stream.flush()
            if len(records) % 10 == 0:
                print(f"Evaluated {len(records)}/{len(rows)}", flush=True)
        result = {
            "model": Path(args.model).name,
            "model_bytes": Path(args.model).stat().st_size,
            "model_sha256": sha256(Path(args.model)),
            "data_sha256": sha256(Path(args.data)),
            "harness_sha256": sha256(Path(__file__).parent / "harness.py"),
            "runner_sha256": sha256(Path(__file__).parent / "runner.py"),
            "prompt_sha256": sha256(Path(args.prompt)) if args.prompt else None,
            "configuration": vars(args),
            "summary": summarize(records),
            "desktop_memory": {
                "peak_rss_bytes": server.peak_rss,
                "peak_private_bytes": server.peak_private,
                "sample_period_ms": 20,
                "not_android_pss": True,
            },
            "desktop_load_ms_single_observation": server.load_ms,
        }
    write_json(output / "summary.json", result)
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
