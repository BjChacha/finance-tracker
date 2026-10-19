"""Render a new synthetic holdout; this is not independent human annotation."""

import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def build():
    source = json.loads((HERE / "heldout-scenarios.json").read_text(encoding="utf-8"))
    rows = []
    days = [
        ("", "today"),
        ("\u6628\u5929", "yesterday"),
        ("\u524d\u5929", "before_yesterday"),
        ("\u4eca\u5929", "today"),
        ("", "today"),
    ]
    for group, template, kind, category, account, destination in source["singles"]:
        for index, (amount, cents) in enumerate(source["amounts"]):
            prefix, day = days[index]
            rows.append(
                {
                    "id": f"{group}-{index + 1}",
                    "group": group,
                    "text": prefix + template.format(amount=amount),
                    "amount_cents": cents,
                    "type": kind,
                    "category": category,
                    "account": account,
                    "to_account": destination,
                    "day": day,
                    "status": "single",
                    "context_variant": "craft" if category == "craft" else "default",
                }
            )
    for group, template in source["guards"]:
        for index, (amount, _) in enumerate(source["amounts"]):
            rows.append(
                {
                    "id": f"{group}-{index + 1}",
                    "group": group,
                    "text": template.format(amount=amount),
                    "amount_cents": "",
                    "type": "",
                    "category": "",
                    "account": "",
                    "to_account": "",
                    "day": "",
                    "status": "clarify",
                    "context_variant": "duplicate_account"
                    if group == "ambiguous_account"
                    else "default",
                }
            )
    assert len(rows) == 200
    assert len({row["text"] for row in rows}) == len(rows)
    assert all(0 < len(row["text"]) <= 200 for row in rows)
    with (HERE / "heldout.tsv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]), delimiter="\t")
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    build()
