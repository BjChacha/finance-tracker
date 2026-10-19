"""Produce full failure records, paired comparisons and ready-preview accuracy."""

import argparse
import csv
import json
from pathlib import Path

from support import ARTIFACTS, write_json


def load(path):
    return [
        json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines()
    ]


def analyze(records, output):
    failures, groups = [], {}
    joint = ready_correct = false_ready = 0
    for row in records:
        expected, actual = row["expected"], row["actual"]
        decision, validated = (
            actual.get("decision") or {},
            actual.get("validated") or {},
        )
        issues = []
        if not actual.get("schema_valid"):
            issues.append("schema")
        if decision.get("status") != expected["status"]:
            issues.append("status")
        if expected["status"] == "single":
            for field in ("amount_cents", "type", "category"):
                if validated.get(field) != expected[field]:
                    issues.append(field)
            for field in ("account", "to_account", "day"):
                if field in expected and decision.get(field) != (
                    expected[field] or None
                ):
                    issues.append(field)
        if validated.get("violations"):
            issues.append("business")
        core_correct = expected["status"] == "single" and not any(
            name in issues
            for name in (
                "schema",
                "status",
                "amount_cents",
                "type",
                "category",
                "business",
            )
        )
        joint += core_correct
        ready = validated.get("status") == "preview"
        ready_correct += ready and core_correct and not issues
        false_ready += ready and (expected["status"] != "single" or bool(issues))
        group = expected.get("group", "unknown")
        counter = groups.setdefault(
            group, {"total": 0, "fully_correct": 0, "core_correct": 0}
        )
        counter["total"] += 1
        counter["fully_correct"] += not issues
        counter["core_correct"] += core_correct
        if issues:
            failures.append(
                {
                    "id": expected["id"],
                    "group": group,
                    "text": expected["text"],
                    "failures": ",".join(issues),
                    "expected": json.dumps(expected, ensure_ascii=False),
                    "decision": json.dumps(decision, ensure_ascii=False),
                    "validated": json.dumps(validated, ensure_ascii=False),
                }
            )
    with (output / "failures.tsv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(
            stream,
            fieldnames=(
                "id",
                "group",
                "text",
                "failures",
                "expected",
                "decision",
                "validated",
            ),
            delimiter="\t",
        )
        writer.writeheader()
        writer.writerows(failures)
    result = {
        "total": len(records),
        "failure_count": len(failures),
        "accepted_core_fields_joint_correct": joint,
        "ready_and_all_annotated_fields_correct": ready_correct,
        "ready_but_incorrect": false_ready,
        "groups": groups,
    }
    write_json(output / "diagnostics.json", result)
    return result


def paired(reference, candidate):
    indexed = {row["expected"]["id"]: row for row in reference}
    fields = ("status", "type", "amount", "category", "account", "to_account", "day")
    result = {field: 0 for field in fields}
    all_equal = 0
    for row in candidate:
        expected = indexed[row["expected"]["id"]]
        left = expected["actual"].get("decision") or {}
        right = row["actual"].get("decision") or {}
        for field in fields:
            result[field] += left.get(field) == right.get(field)
        all_equal += left == right
    return {
        "count": len(candidate),
        "all_fields_equal": all_equal,
        "field_agreement": result,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference", required=True)
    ap.add_argument("--candidates", nargs="+", required=True)
    args = ap.parse_args()
    ref_dir = ARTIFACTS / "reports" / args.reference
    reference = load(ref_dir / "predictions.jsonl")
    analyze(reference, ref_dir)
    comparisons = {}
    for name in args.candidates:
        directory = ARTIFACTS / "reports" / name
        records = load(directory / "predictions.jsonl")
        analyze(records, directory)
        comparisons[name] = paired(reference, records)
    write_json(ARTIFACTS / "reports/paired-comparison.json", comparisons)
    print(json.dumps(comparisons), flush=True)


if __name__ == "__main__":
    main()
