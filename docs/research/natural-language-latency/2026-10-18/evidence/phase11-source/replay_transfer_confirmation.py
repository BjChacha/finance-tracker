"""Quantify confirmation cost on frozen outputs without changing model scores."""

import json

from application_context import build_context
from backend import ARTIFACTS, sha256, write_json
from transfer_confirmation import confirm_transfer_direction


def main():
    results = []
    for name in (
        "qwen4b-example-sparse-catalog-dev",
        "qwen4b-catalog-frozen-regression",
    ):
        source = ARTIFACTS / name / "predictions.jsonl"
        rows = [
            json.loads(line) for line in source.read_text(encoding="utf-8").splitlines()
        ]
        records = []
        for row in rows:
            before = row["actual"]
            after = confirm_transfer_direction(
                row["expected"]["text"],
                build_context(row["expected"])["context"],
                before,
            )
            if before["decision"] != after["decision"]:
                raise ValueError("Confirmation must not modify the model decision")
            if "transfer_direction_review" not in after:
                continue
            fields = row["scoring_actual"]["decision"]
            wrong = [
                key
                for key in ("account", "to_account")
                if (fields.get(key) or "") != row["expected"][key]
            ]
            records.append(
                {
                    "id": row["expected"]["id"],
                    "text": row["expected"]["text"],
                    "wrong_raw_account_fields": wrong,
                    "before_status": before["validated"]["status"],
                    "after_status": after["validated"]["status"],
                    "review": after["transfer_direction_review"],
                    "decision": before["decision"],
                    "validated": after["validated"],
                }
            )
        results.append(
            {
                "run": name,
                "total": len(rows),
                "transfers": len(records),
                "direction_review_required": sum(
                    r["review"]["required"] for r in records
                ),
                "newly_requires_input": sum(
                    r["before_status"] == "preview"
                    and r["after_status"] == "needs_input"
                    for r in records
                ),
                "wrong_account_complete_before": sum(
                    r["before_status"] == "preview"
                    and bool(r["wrong_raw_account_fields"])
                    for r in records
                ),
                "wrong_account_complete_after": sum(
                    r["after_status"] == "preview"
                    and bool(r["wrong_raw_account_fields"])
                    for r in records
                ),
                "records": records,
                "source_sha256": sha256(source),
            }
        )
    write_json(
        ARTIFACTS / "transfer-confirmation-replay.json",
        {
            "scope": "Offline policy replay after observing regression; no model score improvement or new device latency claim",
            "runs": results,
        },
    )
    for result in results:
        print({key: value for key, value in result.items() if key != "records"})


if __name__ == "__main__":
    main()
