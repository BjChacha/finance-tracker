"""Report derived-amount contracts separately from direct amount predictions."""

from collections import Counter

from backend import ARTIFACTS, write_json
from catalog_report import completed_run, run_metrics


def compare(name, baseline_name):
    _, rows, _ = completed_run(name)
    _, previous, _ = completed_run(baseline_name)
    previous = {row["expected"]["id"]: row for row in previous}
    if set(previous) != {row["expected"]["id"] for row in rows}:
        raise ValueError("Dataset IDs do not match")
    changes, amount_modes, output_tokens = [], Counter(), []
    quantity_count = 0
    for row in rows:
        baseline = previous[row["expected"]["id"]]
        if row["expected"] != baseline["expected"]:
            raise ValueError("Labels changed")
        actual = row["actual"]
        prior = baseline["actual"]
        if actual.get("decision") != prior.get("decision"):
            changes.append(
                {
                    "expected": row["expected"],
                    "before": baseline.get("scoring_actual", prior),
                    "after": row["scoring_actual"],
                    "response": actual.get("response"),
                    "amount_resolution": actual.get("amount_resolution"),
                }
            )
        if actual.get("extraction_performed"):
            amount_modes[actual["amount_resolution"]["mode"]] += 1
            quantity_count += len(actual["amount_resolution"]["excluded_quantities"])
            output_tokens.append(
                {
                    "id": row["expected"]["id"],
                    "before": (prior.get("usage") or {}).get("completion_tokens"),
                    "after": (actual.get("usage") or {}).get("completion_tokens"),
                }
            )
    result = run_metrics(name)
    result.update(
        baseline=baseline_name,
        amount_resolution_counts=dict(amount_modes),
        excluded_quantity_candidates=quantity_count,
        changed_decisions=changes,
        field_output_tokens=output_tokens,
        amount_metric_scope="Pipeline amount accuracy includes IDs derived from semantic single confirmation; not all are direct model selections",
    )
    return result


def main():
    pairs = (
        ("qwen4b-unique-amount-dev", "qwen4b-example-sparse-catalog-dev"),
        ("qwen4b-unique-amount-guards", "qwen4b-example-sparse-catalog-guards"),
        ("qwen4b-unique-amount-regression", "qwen4b-prepared-regression"),
        ("qwen4b-unique-amount-regression-guards", "qwen4b-prepared-guards"),
    )
    results = [
        compare(name, baseline)
        for name, baseline in pairs
        if (ARTIFACTS / name / "summary.json").exists()
    ]
    write_json(
        ARTIFACTS / "unique-amount-comparison.json",
        {
            "scope": "Observed data; semantic contract changed; native latency",
            "runs": results,
        },
    )
    for result in results:
        print(
            result["run"],
            {k: v["correct"] for k, v in result["summary"]["semantics"].items()},
            round(result["request_p95_ms"], 3),
            result["requests_over_3s"],
            result["amount_resolution_counts"],
        )


if __name__ == "__main__":
    main()
