"""Measure added date confirmations on observed data without model-score repair."""

from backend import ARTIFACTS, write_json
from catalog_report import completed_run
from date_confirmation import confirm_unsupported_date


def main():
    runs = []
    for name in ("qwen4b-example-sparse-catalog-dev", "qwen4b-prepared-regression"):
        _, rows, _ = completed_run(name)
        records = []
        for row in rows:
            actual = row["actual"]
            result = confirm_unsupported_date(row["expected"]["text"], actual)
            if result.get("decision") != actual.get("decision"):
                raise ValueError("Date review changed the raw decision")
            if "date_review" in result:
                records.append(
                    {
                        "id": row["expected"]["id"],
                        "text": row["expected"]["text"],
                        "expected_day": row["expected"]["day"],
                        "before": actual["validated"],
                        "after": result["validated"],
                        "date_review": result["date_review"],
                    }
                )
        runs.append({"run": name, "total": len(rows), "confirmations": records})
    write_json(
        ARTIFACTS / "date-confirmation-replay.json",
        {"scope": "Observed-output replay; no native latency claim", "runs": runs},
    )
    for run in runs:
        print(run["run"], len(run["confirmations"]))


if __name__ == "__main__":
    main()
