"""Separate type-mixture effects from matched harness improvements."""

import argparse
import json
import sys
from pathlib import Path

from dataset import BASE, HERE, POLICY, ROOT, read_rows, sha256

KINDS = tuple(POLICY["type_percent"])
CORE = ("amount_cents", "type", "category")
AUXILIARY = ("account", "to_account", "day")


def row_metrics(record):
    expected, actual = record["expected"], record["actual"]
    if expected["status"] != "single":
        raise ValueError("Guard rows must not enter transaction accuracy")
    decision, validated = actual.get("decision") or {}, actual.get("validated") or {}
    schema = bool(actual.get("schema_valid"))
    accepted = (
        schema
        and decision.get("status") == "single"
        and not validated.get("violations")
    )
    raw = {key: schema and validated.get(key) == expected[key] for key in CORE}
    auxiliary = {
        key: schema and decision.get(key) == (expected[key] or None)
        for key in AUXILIARY
    }
    ready = validated.get("status") == "preview"
    correct = accepted and all(raw.values()) and all(auxiliary.values())
    return {
        **{f"raw_{key}": int(value) for key, value in raw.items()},
        **{f"usable_{key}": int(accepted and value) for key, value in raw.items()},
        **{f"raw_{key}": int(value) for key, value in auxiliary.items()},
        "ready_correct": int(ready and correct),
        "ready_incorrect": int(ready and not correct),
        "needs_input": int(not ready),
    }


def summarize(records):
    singles = [row for row in records if row["expected"]["status"] == "single"]
    if any(row["expected"]["type"] not in KINDS for row in singles):
        raise ValueError("Unknown expected transaction type")
    per_type = {}
    confusion = {kind: {name: 0 for name in (*KINDS, "unknown")} for kind in KINDS}
    for kind in KINDS:
        rows = [row for row in singles if row["expected"]["type"] == kind]
        if not rows:
            raise ValueError(f"Missing type stratum: {kind}")
        metrics = [row_metrics(row) for row in rows]
        counts = {key: sum(item[key] for item in metrics) for key in metrics[0]}
        per_type[kind] = {
            "total": len(rows),
            "counts": counts,
            "rates": {key: value / len(rows) for key, value in counts.items()},
        }
        for row in rows:
            predicted = (row["actual"].get("validated") or {}).get("type")
            confusion[kind][predicted if predicted in KINDS else "unknown"] += 1
    keys = next(iter(per_type.values()))["counts"]
    aggregate = {
        "empirical": {
            key: sum(item["counts"][key] for item in per_type.values()) / len(singles)
            for key in keys
        },
        "macro": {
            key: sum(item["rates"][key] for item in per_type.values()) / len(KINDS)
            for key in keys
        },
        "target_weighted": {
            key: sum(
                POLICY["type_percent"][kind] / 100 * item["rates"][key]
                for kind, item in per_type.items()
            )
            for key in keys
        },
    }
    return {
        "single_count": len(singles),
        "per_type": per_type,
        "aggregate": aggregate,
        "raw_type_confusion": confusion,
        "always_expense_type_baseline": {
            "empirical": per_type["expense"]["total"] / len(singles),
            "target_weighted": 0.85,
            "macro": 1 / 3,
        },
    }


def check_records(records, rows):
    expected = {row["id"]: row for row in rows}
    ids = [row["expected"]["id"] for row in records]
    if len(ids) != len(set(ids)) or set(ids) != set(expected):
        raise ValueError("Incomplete, duplicate or foreign predictions")
    for record in records:
        row = expected[record["expected"]["id"]]
        for key in (
            "id",
            "text",
            "group",
            "status",
            "context_variant",
            *CORE,
            *AUXILIARY,
        ):
            value = row[key]
            if key == "amount_cents":
                value = int(value) if value else None
            if record["expected"].get(key) != value:
                raise ValueError(f"Mismatched data: {row['id']} {key}")


def guard_metrics(records):
    if any(row["expected"]["status"] != "clarify" for row in records):
        raise ValueError("Single transactions cannot enter guard accuracy")
    return {
        "count": len(records),
        "semantic_abstentions": sum(
            (row["actual"].get("decision") or {}).get("status") == "clarify"
            for row in records
        ),
        "unsafe_previews": sum(
            (row["actual"].get("validated") or {}).get("status") == "preview"
            for row in records
        ),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()
    args.run = args.run.resolve()
    sys.path.insert(0, str(BASE / "jev_harness"))
    from bridge import analyze, load
    from counterfactual import replay

    data = HERE / "data/regression.tsv"
    run_manifest = json.loads((args.run / "manifest.json").read_text(encoding="utf-8"))
    if run_manifest["data_sha256"] != sha256(data):
        raise ValueError("Run used a different dataset revision")
    records = {}
    sources = {}
    old_root = ROOT / "artifacts/natural-language-jev-harness/regression"
    for version, folder in (("new", args.run), ("old", old_root)):
        records[version] = {}
        for variant in ("baseline", "category_only"):
            path = folder / variant / "predictions.jsonl"
            sources[path.relative_to(ROOT).as_posix()] = sha256(path)
            rows = load(path)
            if version == "new":
                check_records(rows, read_rows(data))
            else:
                check_records(rows, read_rows(BASE / "instruct/heldout.tsv"))
            records[version][variant] = rows
        records[version]["conservative"], _ = replay(
            records[version]["category_only"], repair_accounts=True, fix_dates=True
        )
    result = {
        "policy": POLICY,
        "sources": sources,
        "dataset_sha256": sha256(data),
        "guard_origin": "Reused frozen phone regression; identical guard texts and labels; no new guard inference",
        "conservative": "Frozen category_only decisions + deterministic date handling and clearing invalid self-transfer accounts",
        "old_distribution_reweighting": {
            variant: summarize(rows) for variant, rows in records["old"].items()
        },
        "new_regression": {
            variant: summarize(rows) for variant, rows in records["new"].items()
        },
        "guards": {},
    }
    for variant, rows in records["old"].items():
        guards = [row for row in rows if row["expected"]["status"] == "clarify"]
        check_records(guards, read_rows(HERE / "data/regression-guards.tsv"))
        result["guards"][variant] = guard_metrics(guards)
    args.output.mkdir(parents=True, exist_ok=False)
    for variant, rows in records["new"].items():
        folder = args.output / variant
        folder.mkdir()
        analyze(rows, folder)
        if variant == "conservative":
            (folder / "predictions.jsonl").write_text(
                "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
                encoding="utf-8",
            )
    (args.output / "comparison.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                name: item["aggregate"]["empirical"]
                for name, item in result["new_regression"].items()
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
