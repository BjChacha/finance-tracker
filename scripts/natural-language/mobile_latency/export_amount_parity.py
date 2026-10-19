"""Export frozen Python amount behavior for the application implementation."""

import csv
import json
import sys
from pathlib import Path

from backend import ARTIFACTS, ROOT, contract, sha256, write_json
from labels import catalog_context
from unique_amount import split_amount_candidates

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from money import parse_money


def main():
    source = ROOT / "scripts/natural-language"
    texts = []
    datasets = sorted((source / "distribution_v1/data").glob("*.tsv"))
    for path in datasets:
        with path.open(encoding="utf-8", newline="") as stream:
            texts.extend(row["text"] for row in csv.DictReader(stream, delimiter="\t"))
    texts.extend(
        [
            "\U0001f697\u5145\u753530\u5757",
            "\U0001f6d2\u4e70\u4e863\u74f6\u6c34\u82b115\u5143",
        ]
    )
    amounts = json.loads((source / "data/money-tests.json").read_text(encoding="utf-8"))
    spans = list(
        dict.fromkeys(
            [row[0] for row in amounts]
            + [
                "90071992547409.91",
                "90071992547409.92",
                "90071992547409919999",
            ]
        )
    )
    records = []
    for text in dict.fromkeys(texts):
        candidates = contract.amount_candidates(text)
        kept, quantities = split_amount_candidates(text, candidates)
        records.append(
            {
                "text": text,
                "all": candidates,
                "candidates": kept,
                "quantities": quantities,
            }
        )
        spans.extend(item["text"] for item in candidates)
    write_json(
        ROOT / "src/features/transactions/natural-language/__tests__/money-parity.json",
        {
            "scope": "Normalization parity only; not semantic accuracy or human review",
            "sources": {
                str(path.relative_to(ROOT)): sha256(path)
                for path in [
                    *datasets,
                    source / "money.py",
                    source / "instruct/harness.py",
                    source / "mobile_latency/unique_amount.py",
                    source / "data/money-tests.json",
                ]
            },
            "spans": [
                {"text": text, "cents": parse_money(text)}
                for text in dict.fromkeys(spans)
            ],
            "records": records,
        },
    )
    print(f"Exported {len(records)} input records")
    context_path = (
        ARTIFACTS / "qwen4b-unique-amount-regression-m098fe-ready/contexts.json"
    )
    contexts = json.loads(context_path.read_text(encoding="utf-8"))
    context_records = []
    for name, fixture in contexts.items():
        mapped, reverse = catalog_context(fixture["context"])
        context_records.append(
            {
                "name": name,
                "input": fixture["context"],
                "context": mapped,
                "reverse": reverse,
            }
        )
    write_json(
        ROOT
        / "src/features/transactions/natural-language/__tests__/context-parity.json",
        {"source_sha256": sha256(context_path), "records": context_records},
    )


if __name__ == "__main__":
    main()
