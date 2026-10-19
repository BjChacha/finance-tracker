"""Compare completed prepared runs with immutable model-call baselines."""

from collections import Counter

from backend import ARTIFACTS, evaluation, write_json
from catalog_report import completed_run, read_json, run_metrics


def stage_metrics(rows, stage):
    values = []
    for row in rows:
        actual = row["actual"]
        if stage == "gate":
            elapsed = actual.get("gate", {}).get("elapsed_ms")
        else:
            elapsed = actual.get("extraction_elapsed_ms")
        if elapsed is not None:
            values.append(elapsed)
    return {
        "count": len(values),
        "p95_ms": evaluation.percentile(values, 95) if values else None,
        "max_ms": max(values) if values else None,
    }


def compare_run(name, baseline_name):
    folder, rows, _ = completed_run(name)
    _, baseline_rows, _ = completed_run(baseline_name)
    baseline = {row["expected"]["id"]: row for row in baseline_rows}
    if set(baseline) != {row["expected"]["id"] for row in rows}:
        raise ValueError("Comparison requires identical sample IDs")
    matches = Counter()
    changes, slow, wrong_account_previews = [], [], []
    review_count = 0
    for row in rows:
        original = baseline[row["expected"]["id"]]
        if row["expected"] != original["expected"]:
            raise ValueError("Comparison labels changed")
        actual, previous = row["actual"], original["actual"]
        for field in ("request", "decision"):
            matches[field] += actual.get(field) == previous.get(field)
        matches["gate_request"] += actual.get("gate", {}).get(
            "request"
        ) == previous.get("gate", {}).get("request")
        matches["gate_response"] += actual.get("gate", {}).get(
            "response"
        ) == previous.get("gate", {}).get("response")
        if actual.get("decision") != previous.get("decision"):
            changes.append(row["expected"]["id"])
        review_count += actual.get("transfer_direction_review", {}).get(
            "required", False
        )
        fields = row["scoring_actual"].get("decision") or {}
        if actual["validated"]["status"] == "preview" and any(
            (fields.get(key) or "") != row["expected"][key]
            for key in ("account", "to_account")
        ):
            wrong_account_previews.append(row["expected"]["id"])
        if actual["elapsed_ms"] > 3000:
            slow.append(
                {
                    "id": row["expected"]["id"],
                    "elapsed_ms": actual["elapsed_ms"],
                    "before_review_ms": actual.get("before_review_elapsed_ms"),
                    "gate": actual.get("gate", {}).get("timings"),
                    "fields": actual.get("timings"),
                    "gate_elapsed_ms": actual.get("gate", {}).get("elapsed_ms"),
                    "fields_elapsed_ms": actual.get("extraction_elapsed_ms"),
                    "context_key": row["context_key"],
                }
            )
    result = run_metrics(name)
    result.update(
        baseline=baseline_name,
        parity=dict(matches),
        parity_scope="Per-row equality includes omitted model requests",
        call_counts={
            "gate": sum("request" in r["actual"].get("gate", {}) for r in rows),
            "fields": sum(r["actual"].get("extraction_performed", False) for r in rows),
        },
        changed_model_decisions=changes,
        stages={stage: stage_metrics(rows, stage) for stage in ("gate", "fields")},
        slow_requests=slow,
        transfer_direction_confirmations=review_count,
        wrong_account_complete_previews=wrong_account_previews,
        validated_status_counts=dict(
            Counter(r["actual"]["validated"]["status"] for r in rows)
        ),
        context_waits=read_json(folder / "preload.json"),
    )
    return result


def main():
    pairs = (
        ("qwen4b-prepared-regression", "qwen4b-catalog-frozen-regression"),
        ("qwen4b-prepared-guards", "qwen4b-catalog-frozen-guards"),
    )
    results = [
        compare_run(name, baseline)
        for name, baseline in pairs
        if (ARTIFACTS / name / "summary.json").exists()
    ]
    write_json(
        ARTIFACTS / "prepared-comparison.json",
        {
            "scope": "Observed regression; explicit readiness waits; native latency is not UI latency",
            "runs": results,
        },
    )
    for result in results:
        print(
            result["run"],
            result["parity"],
            round(result["request_p95_ms"], 3),
            result["requests_over_3s"],
            result["validated_status_counts"],
        )


if __name__ == "__main__":
    main()
