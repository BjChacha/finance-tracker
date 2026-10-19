"""Load and validate synthetic candidate data without concealing review status."""

import csv

from common import HERE, digest, read_json


def load_split(split):
    if split not in ("dev", "test"):
        raise ValueError("Unknown split")
    with (HERE / "data" / f"{split}.tsv").open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream, delimiter="\t"))
    for index, row in enumerate(rows):
        row["id"] = f"{split}-{index + 1:03d}"
        row["amount_cents"] = int(row["amount_cents"]) if row["amount_cents"] else None
    return rows


def validate_corpus():
    context = read_json(HERE / "data" / "context.json")
    categories = {row["id"]: row for row in context["categories"]}
    dev, test = load_split("dev"), load_split("test")
    if len(dev) != 100 or len(test) != 200:
        raise ValueError(f"Expected 100/200 samples, got {len(dev)}/{len(test)}")
    if {r["group"] for r in dev} & {r["group"] for r in test}:
        raise ValueError("Scenario group leaks across splits")
    texts = [row["text"] for row in dev + test]
    if len(texts) != len(set(texts)):
        raise ValueError("Duplicate utterance")
    for row in dev + test:
        if not row["text"].strip() or len(row["text"]) > 200:
            raise ValueError(f"Invalid text length: {row['id']}")
        if row["status"] == "single":
            if not row["amount_cents"] or row["amount_cents"] < 0:
                raise ValueError(f"Invalid amount: {row['id']}")
            if categories[row["category"]]["type"] != row["type"]:
                raise ValueError(f"Type/category mismatch: {row['id']}")
        elif row["status"] != "clarify" or any(
            row[key] for key in ("amount_cents", "type", "category")
        ):
            raise ValueError(f"Invalid clarification label: {row['id']}")
    return {
        "counts": {"dev": len(dev), "test": len(test)},
        "review": context["review"],
        "hashes": {
            split: digest(HERE / "data" / f"{split}.tsv") for split in ("dev", "test")
        },
    }


if __name__ == "__main__":
    print(validate_corpus())
