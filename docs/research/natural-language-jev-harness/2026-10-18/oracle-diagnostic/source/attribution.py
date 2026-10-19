"""Partition frozen failures without treating safety rejection as a model error."""

import argparse
from collections import Counter
from pathlib import Path

from bridge import ARTIFACTS, contract, load, write_json


def attribute(records):
    losses = {field: Counter() for field in ("amount_cents", "type", "category")}
    ranks, excluded, confusions, violations, groups = (
        Counter(),
        0,
        Counter(),
        Counter(),
        {},
    )
    recoverable = 0
    for record in records:
        expected, actual = record["expected"], record["actual"]
        decision, validated = actual["decision"], actual["validated"]
        violations.update(validated["violations"])
        group = groups.setdefault(expected["group"], Counter())
        group["count"] += 1
        group[f"status_{decision['status']}"] += 1
        if expected["status"] != "single":
            continue
        for field, counts in losses.items():
            if validated[field] != expected[field]:
                counts["raw_wrong"] += 1
            elif decision["status"] != "single":
                counts["correct_but_status_blocked"] += 1
                counts["status_blocked_also_violation"] += bool(validated["violations"])
            elif validated["violations"]:
                counts["correct_but_violation_only"] += 1
            else:
                counts["usable_correct"] += 1
        answers = actual["answers"].get("category", {}).get("probabilities", {})
        ranking = sorted(answers, key=answers.get, reverse=True)
        if expected["category"] in ranking:
            ranks[str(ranking.index(expected["category"]) + 1)] += 1
        else:
            excluded += 1
        confusions[f"{expected['category']} -> {decision['category']}"] += 1
        for field in ("type", "category", "account", "to_account", "day"):
            if field in expected:
                group[f"{field}_wrong"] += decision[field] != (expected[field] or None)
        if "same_transfer_account" in validated["violations"]:
            repaired = {**decision, "account": None, "to_account": None}
            check = contract.validate_business(
                repaired, expected["text"], contract.context_for(expected)
            )
            recoverable += check["status"] == "needs_input"
    return {
        "exclusive_losses": losses,
        "category_gold_rank": ranks,
        "category_gold_excluded_by_type": excluded,
        "category_confusions": dict(confusions.most_common()),
        "violations_all_records": violations,
        "single_same_account_recoverable_as_incomplete": recoverable,
        "groups": groups,
        "interpretation": "Raw errors are not proof of model incapacity; prompt and candidate interventions are needed. Safety checks remain unchanged.",
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("predictions")
    ap.add_argument("--output", default=str(ARTIFACTS / "baseline-attribution.json"))
    args = ap.parse_args()
    result = attribute(load(args.predictions))
    write_json(Path(args.output), result)
    import json

    print(json.dumps({k: v for k, v in result.items() if k != "groups"}, indent=2))


if __name__ == "__main__":
    main()
