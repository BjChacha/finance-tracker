"""Audit prompt-only changes against identical input IDs and frozen validators."""

import json

from backend import ARTIFACTS, write_json


def read_run(name):
    path = ARTIFACTS / name / "predictions.jsonl"
    return {
        row["expected"]["id"]: row
        for row in (
            json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()
        )
    }


def main():
    results = {}
    for split, before, after in (
        ("dev", "qwen4b-lean-dev", "qwen4b-example-dev"),
        ("guards", "qwen4b-lean-dev-guards", "qwen4b-example-guards"),
    ):
        old, new = read_run(before), read_run(after)
        if old.keys() != new.keys():
            raise ValueError("Input ID sets differ")
        changed = []
        for key, left in old.items():
            right = new[key]
            if left["expected"] != right["expected"]:
                raise ValueError(f"Input differs: {key}")
            if left["actual"]["decision"] != right["actual"]["decision"]:
                changed.append(
                    {
                        "id": key,
                        "expected": left["expected"],
                        "before": left["actual"]["decision"],
                        "after": right["actual"]["decision"],
                        "before_validated": left["actual"]["validated"],
                        "after_validated": right["actual"]["validated"],
                    }
                )
        results[split] = {"count": len(old), "changed": changed}
        if split == "guards":
            results[split]["outcomes"] = {
                label: {
                    "clarify": sum(
                        r["actual"]["decision"]["status"] == "clarify"
                        for r in rows.values()
                    ),
                    "unsafe_complete": sum(
                        r["actual"]["validated"]["status"] == "preview"
                        for r in rows.values()
                    ),
                    "multi_clarify": sum(
                        r["actual"]["decision"]["status"] == "clarify"
                        for r in rows.values()
                        if r["expected"]["group"] == "multi_meal"
                    ),
                }
                for label, rows in (("before", old), ("after", new))
            }
    write_json(ARTIFACTS / "harness-example-delta.json", results)
    print(
        {
            split: {"count": row["count"], "changed": len(row["changed"])}
            for split, row in results.items()
        }
    )
    print(results["guards"]["outcomes"])


if __name__ == "__main__":
    main()
