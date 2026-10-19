"""Report corrections and regressions, rather than only net accuracy changes."""

import argparse
from collections import Counter
from pathlib import Path

from bridge import load, write_json


def correct(record, field):
    expected, actual = record["expected"], record["actual"]
    if field == "status":
        return actual["decision"][field] == expected[field]
    if expected["status"] != "single":
        return None
    value = (
        actual["validated"].get(field)
        if field in ("type", "category", "amount_cents")
        else actual["decision"].get(field)
    )
    return value == (expected[field] or None)


def transitions(before, after):
    indexed = {r["expected"]["id"]: r for r in before}
    fields = (
        "amount_cents",
        "type",
        "category",
        "account",
        "to_account",
        "day",
        "status",
    )
    output = {
        field: {"counts": Counter(), "corrected_ids": [], "regressed_ids": []}
        for field in fields
    }
    for row in after:
        row_id = row["expected"]["id"]
        original = indexed[row_id]
        for field in fields:
            left, right = correct(original, field), correct(row, field)
            if left is None:
                continue
            state = (
                "both_correct"
                if left and right
                else "corrected"
                if right
                else "regressed"
                if left
                else "both_wrong"
            )
            output[field]["counts"][state] += 1
            if state in ("corrected", "regressed"):
                output[field][state + "_ids"].append(row_id)
    return output


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("before")
    ap.add_argument("after")
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    result = transitions(load(args.before), load(args.after))
    write_json(Path(args.output), result)
    for field, value in result.items():
        print(field, dict(value["counts"]))


if __name__ == "__main__":
    main()
