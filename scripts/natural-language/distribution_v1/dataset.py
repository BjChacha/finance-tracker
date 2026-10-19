"""Build a versioned, prediction-independent transaction mixture."""

import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASE = HERE.parent
FIELDS = (
    "id",
    "group",
    "text",
    "amount_cents",
    "type",
    "category",
    "account",
    "to_account",
    "day",
    "status",
    "context_variant",
    "source",
    "source_id",
    "review_status",
)
POLICY = json.loads((HERE / "policy.json").read_text(encoding="utf-8"))


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_rows(path, prefix=None):
    with Path(path).open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream, delimiter="\t"))
    for index, row in enumerate(rows, 1):
        row["id"] = row.get("id") or f"{prefix or path.stem}-{index:03d}"
    return rows


def sourced(path, prefix=None):
    rows = read_rows(path, prefix)
    for row in rows:
        row.update(
            source=path.relative_to(ROOT).as_posix(),
            source_id=row["id"],
            review_status=POLICY["review_status"],
        )
        row.setdefault("context_variant", "default")
        for key in ("account", "to_account", "day"):
            row.setdefault(key, "")
    return rows


def select_by_group(rows, count):
    """Spread the quota across groups without consulting model outcomes."""
    if len(rows) < count:
        raise ValueError(f"Insufficient unique rows: {len(rows)} < {count}")

    def rank(value):
        return hashlib.sha256((POLICY["selection_seed"] + value).encode()).hexdigest()

    groups = defaultdict(list)
    for row in sorted(rows, key=lambda item: rank(item["id"])):
        groups[row["group"]].append(row)
    selected = []
    for index in range(max(map(len, groups.values()), default=0)):
        for group in sorted(groups, key=rank):
            if index < len(groups[group]):
                selected.append(groups[group][index])
                if len(selected) == count:
                    return selected
    return selected


def validate_sets(sets):
    for split, total in POLICY["single_counts"].items():
        rows = sets[f"{split}.tsv"]
        target = {
            kind: total * pct // 100 for kind, pct in POLICY["type_percent"].items()
        }
        if any(total * pct % 100 for pct in POLICY["type_percent"].values()):
            raise ValueError("Quotas must be exact integers")
        if len(rows) != total or Counter(row["type"] for row in rows) != target:
            raise ValueError(f"Wrong type mixture in {split}")
        if any(row["status"] != "single" for row in rows):
            raise ValueError("Guards cannot enter the single-transaction denominator")
        guards = sets[f"{split}-guards.tsv"]
        if len(guards) != POLICY["guard_counts"][split] or any(
            row["status"] != "clarify" for row in guards
        ):
            raise ValueError(f"Wrong guard set in {split}")
    all_rows = [row for rows in sets.values() for row in rows]
    for key in ("id", "text"):
        if len({row[key] for row in all_rows}) != len(all_rows):
            raise ValueError(f"Duplicate {key}")
    for key in ("group", "text"):
        dev = {
            row[key]
            for name, rows in sets.items()
            if name.startswith("dev")
            for row in rows
            if key != "group" or row["status"] == "single"
        }
        regression = {
            row[key]
            for name, rows in sets.items()
            if name.startswith("regression")
            for row in rows
            if key != "group" or row["status"] == "single"
        }
        if dev & regression:
            raise ValueError(f"Cross-split overlap in {key}: {dev & regression}")
    context = json.loads((BASE / "data/context.json").read_text(encoding="utf-8"))
    accounts = {item["id"] for item in context["accounts"] if item["active"]}
    categories = {item["id"]: item["type"] for item in context["categories"]}
    for row in all_rows:
        if len(row["text"]) > 200:
            raise ValueError("Text exceeds the product input limit")
        if row["status"] != "single":
            continue
        available = {
            **categories,
            **({"craft": "expense"} if row["context_variant"] == "craft" else {}),
        }
        if (
            available.get(row["category"]) != row["type"]
            or int(row["amount_cents"]) <= 0
        ):
            raise ValueError(f"Invalid amount or category: {row['id']}")
        if row["day"] not in ("today", "yesterday", "before_yesterday", "unknown"):
            raise ValueError(f"Missing date annotation: {row['id']}")
        if any(
            row[key] and row[key] not in accounts for key in ("account", "to_account")
        ):
            raise ValueError(f"Invalid account: {row['id']}")
        if row["type"] == "transfer" and (
            not row["account"]
            or not row["to_account"]
            or row["account"] == row["to_account"]
        ):
            raise ValueError(f"Invalid transfer direction: {row['id']}")
        if row["type"] != "transfer" and row["to_account"]:
            raise ValueError(f"Unexpected destination: {row['id']}")


def build_sets():
    dev_source = BASE / "jev_harness/dev-annotated.tsv"
    test_source = BASE / "instruct/heldout.tsv"
    legacy_source = BASE / "data/test.tsv"
    additions = HERE / "dev-additions.tsv"
    dev, regression = sourced(dev_source), sourced(test_source)
    legacy = sourced(legacy_source, "legacy-test")
    annotation = POLICY["legacy_auxiliary_annotations"]
    for index, row in enumerate(legacy, 1):
        row["account"] = annotation["accounts"].get(str(index), "")
        row["day"] = next(
            (
                day
                for day in ("yesterday", "before_yesterday", "unknown")
                if index in annotation[day]
            ),
            "today",
        )
    extra = [
        row
        for row in legacy
        if row["type"] == "expense"
        and row["group"] not in POLICY["legacy_expense_excluded_groups"]
    ]
    pools = {"dev": dev + sourced(additions), "regression": regression + extra}
    sets = {}
    for split, pool in pools.items():
        selected = []
        for kind, percent in POLICY["type_percent"].items():
            selected.extend(
                select_by_group(
                    [
                        row
                        for row in pool
                        if row["status"] == "single" and row["type"] == kind
                    ],
                    POLICY["single_counts"][split] * percent // 100,
                )
            )
        sets[f"{split}.tsv"] = sorted(selected, key=lambda row: row["id"])
        sets[f"{split}-guards.tsv"] = [
            row for row in pool if row["status"] == "clarify"
        ]
    validate_sets(sets)
    return sets, (
        dev_source,
        test_source,
        legacy_source,
        additions,
        HERE / "policy.json",
        BASE / "data/context.json",
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", type=Path, default=HERE / "data")
    args = ap.parse_args()
    sets, sources = build_sets()
    args.output.mkdir(parents=True, exist_ok=False)
    for name, rows in sets.items():
        with (args.output / name).open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(
                stream, fieldnames=FIELDS, delimiter="\t", lineterminator="\n"
            )
            writer.writeheader()
            writer.writerows(rows)
    manifest = {
        "policy": POLICY,
        "sources": {
            path.relative_to(ROOT).as_posix(): sha256(path) for path in sources
        },
        "builder_sha256": sha256(Path(__file__)),
        "outputs": {
            name: {
                "sha256": sha256(args.output / name),
                "count": len(rows),
                "types": dict(Counter(row["type"] for row in rows)),
            }
            for name, rows in sets.items()
        },
        "old_frozen_data_modified": False,
        "sampling": "Group round-robin, stable hash order; no replacement or prediction-based selection",
        "legacy_auxiliary_labels": "Assistant annotated; explicit dates and account mentions; case 75 date is unknown",
    }
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest["outputs"], indent=2))


if __name__ == "__main__":
    main()
