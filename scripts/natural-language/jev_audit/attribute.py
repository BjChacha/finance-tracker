"""Attribute frozen errors without pretending all prompts were complete."""

import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "jev_harness"))
from bridge import load, sha256, write_json


def main():
    source = ROOT / "artifacts/natural-language-jev-harness/distribution-v1-regression"
    output = ROOT / "artifacts/natural-language-jev-audit/attribution"
    output.mkdir(parents=True, exist_ok=False)
    summary = {}
    for variant in ("baseline", "category_only"):
        path = source / variant / "predictions.jsonl"
        rows = load(path)
        counts = Counter()
        evidence = []
        for row in rows:
            expected, actual = row["expected"], row["actual"]
            decision, validated = actual["decision"], actual["validated"]
            type_wrong = decision["type"] != expected["type"]
            category_wrong = validated["category"] != expected["category"]
            candidates = actual["answers"].get("category", {}).get("probabilities", {})
            gold_available = expected["category"] in candidates
            counts["type_wrong"] += type_wrong
            counts["category_wrong"] += category_wrong
            counts["category_wrong_gold_unavailable"] += (
                category_wrong and not gold_available
            )
            counts["category_wrong_gold_available"] += category_wrong and gold_available
            counts["single_abstained"] += decision["status"] != "single"
            counts["business_violation"] += bool(validated["violations"])
            counts["raw_category_correct_but_unusable"] += not category_wrong and (
                decision["status"] != "single" or bool(validated["violations"])
            )
            counts["self_transfer"] += (
                "same_transfer_account" in validated["violations"]
            )
            if type_wrong or category_wrong or validated["violations"]:
                evidence.append(
                    {
                        "id": expected["id"],
                        "text": expected["text"],
                        "expected": expected,
                        "decision": decision,
                        "gold_category_available": gold_available,
                        "violations": validated["violations"],
                        "category_probabilities": candidates,
                        "category_attribution": (
                            "upstream_type_removed_gold_candidate"
                            if not gold_available
                            else "ranking_error_with_gold_present_prompt_may_still_be_incomplete"
                        )
                        if category_wrong
                        else "correct",
                        "explicit_category_priority_in_prompt": False,
                    }
                )
        summary[variant] = {
            "total": len(rows),
            "counts": dict(counts),
            "source": str(path.relative_to(ROOT)),
            "sha256": sha256(path),
        }
        write_json(output / f"{variant}-evidence.json", evidence)
    write_json(output / "summary.json", summary)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
