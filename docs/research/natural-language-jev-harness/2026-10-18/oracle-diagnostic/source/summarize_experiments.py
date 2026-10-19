"""Keep old metrics and full-preview accuracy visible in every comparison."""

import argparse
import csv
import json
from copy import deepcopy

from bridge import ARTIFACTS, HERE, analyze, evaluation, load, write_json


def compact_metrics(records, folder):
    summary = evaluation.summarize(records)
    details = analyze(records, folder)
    summary.pop("observed_desktop_latency_ms")
    single = [r for r in records if r["expected"]["status"] == "single"]
    guard = [r for r in records if r["expected"]["status"] != "single"]
    result = {
        "count": len(records),
        "singles": len(single),
        "schema": summary["schema_valid"],
        "business_consistent": summary["business_consistent"],
        "raw_amount": summary["semantics"]["amount_cents"][
            "raw_field_correct_diagnostic"
        ],
        "raw_type": summary["semantics"]["type"]["raw_field_correct_diagnostic"],
        "raw_category": summary["semantics"]["category"][
            "raw_field_correct_diagnostic"
        ],
        "usable_amount": summary["semantics"]["amount_cents"]["correct"],
        "usable_type": summary["semantics"]["type"]["correct"],
        "usable_category": summary["semantics"]["category"]["correct"],
        "guard_abstentions": summary["guards"]["correct_abstentions"],
        "guard_count": len(guard),
        "guard_ready": sum(
            r["actual"]["validated"]["status"] == "preview" for r in guard
        ),
        "single_accepted": summary["guards"]["clear_single_accepted"],
        "ready_correct": details["ready_and_all_annotated_fields_correct"],
        "ready_incorrect": details["ready_but_incorrect"],
        "needs_input": summary["needs_manual_input"],
        "account_correct": summary["auxiliary"]["account"]["raw_correct"],
        "destination_correct": summary["auxiliary"]["to_account"]["raw_correct"],
        "day_correct": summary["auxiliary"]["day"]["raw_correct"],
    }
    write_json(folder / "summary.json", summary)
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", nargs="+", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--annotate-dev", action="store_true")
    args = ap.parse_args()
    output = ARTIFACTS / args.output
    output.mkdir(parents=True, exist_ok=False)
    labels = {r["id"]: r for r in evaluation.load_rows(HERE / "dev-annotated.tsv")}
    result = {}
    for run in args.runs:
        for path in sorted((ARTIFACTS / run).glob("*/predictions.jsonl")):
            name = run + "_" + path.parent.name
            records = load(path)
            if args.annotate_dev:
                records = deepcopy(records)
                for record in records:
                    for key in ("account", "to_account", "day"):
                        record["expected"][key] = labels[record["expected"]["id"]][key]
            folder = output / name
            folder.mkdir()
            result[name] = compact_metrics(records, folder)
    write_json(output / "comparison.json", result)
    with (output / "comparison.tsv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(
            stream, fieldnames=["variant", *next(iter(result.values()))], delimiter="\t"
        )
        writer.writeheader()
        for name, metrics in result.items():
            writer.writerow({"variant": name, **metrics})
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
