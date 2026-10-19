"""Replay field-preserving repairs; never label them semantic model gains."""

import argparse
from copy import deepcopy

from bridge import ARTIFACTS, analyze, contract, evaluation, load, write_json
from revision import day_from_evidence


def replay(records, repair_accounts=False, fix_dates=False):
    output = deepcopy(records)
    changed = []
    for row in output:
        actual, expected = row["actual"], row["expected"]
        decision = actual["decision"]
        before = deepcopy(decision)
        if repair_accounts and "same_transfer_account" in actual["validated"]["violations"]:
            decision["account"] = decision["to_account"] = None
        if fix_dates:
            decision["day"] = day_from_evidence(expected["text"])
        if decision != before:
            changed.append(expected["id"])
        actual["validated"] = contract.validate_business(
            decision, expected["text"], contract.context_for(expected)
        )
    return output, changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("predictions")
    args = ap.parse_args()
    records = load(args.predictions)
    root = ARTIFACTS / "counterfactual"
    root.mkdir(parents=True, exist_ok=False)
    results = {}
    for name, accounts, dates in (
        ("baseline", False, False),
        ("repair_only", True, False),
        ("date_only", False, True),
        ("repair_and_date", True, True),
    ):
        output = root / name
        output.mkdir()
        replayed, changed = replay(records, accounts, dates)
        summary = evaluation.summarize(replayed)
        summary.pop("observed_desktop_latency_ms")
        details = analyze(replayed, output)
        results[name] = {"summary": summary, "diagnostics": details, "changed_ids": changed}
    write_json(root / "comparison.json", results)
    for name, result in results.items():
        print(name, {k: v["correct"] for k, v in result["summary"]["semantics"].items()},
              result["diagnostics"]["ready_and_all_annotated_fields_correct"],
              result["diagnostics"]["ready_but_incorrect"])


if __name__ == "__main__":
    main()
