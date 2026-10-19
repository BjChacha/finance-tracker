"""Missing predictions count as misses, never disappear from denominators."""

THRESHOLDS = {"amount_cents": 0.99, "type": 0.95, "category": 0.90}


def summarize(rows):
    single = [row for row in rows if row["expected"]["status"] == "single"]
    guards = [row for row in rows if row["expected"]["status"] == "clarify"]
    metrics = {}
    for field, threshold in THRESHOLDS.items():
        correct = sum(
            row["prediction"].get(field) == row["expected"][field] for row in single
        )
        missing = sum(row["prediction"].get(field) is None for row in single)
        count = len(single)
        metrics[field] = {
            "correct": correct,
            "total": count,
            "accuracy": correct / count if count else None,
            "abstentions": missing,
            "threshold": threshold,
            "passed": bool(count and correct / count >= threshold),
        }
    metrics["guard_cases"] = {
        "total": len(guards),
        "unsafe_single_predictions": sum(
            row["prediction"].get("status") == "single" for row in guards
        ),
        "clear_single_accepted": sum(
            row["prediction"].get("status") == "single" for row in single
        ),
        "clear_single_total": len(single),
    }
    metrics["manual_completion"] = {
        "total": len(rows),
        "count": sum(bool(row["prediction"].get("unresolved")) for row in rows),
    }
    return metrics


def release_gate(
    metrics, *, human_review=False, mobile=None, parity=None, resource_bytes=None
):
    checks = {
        field: metrics.get(field, {}).get("passed") is True for field in THRESHOLDS
    }
    checks["human_review"] = human_review
    checks["resources"] = (
        resource_bytes is not None and 0 < resource_bytes <= 150_000_000
    )
    checks["reference_and_quantization_parity"] = parity is True
    checks["mobile"] = bool(
        mobile
        and mobile.get("offline_first_launch") is True
        and 0 < mobile.get("warm_p95_ms", float("inf")) <= 1000
        and 0 < mobile.get("cold_p95_ms", float("inf")) <= 3000
        and 0 < mobile.get("extra_peak_pss_mb", float("inf")) <= 300
    )
    return {"passed": all(checks.values()), "checks": checks}
