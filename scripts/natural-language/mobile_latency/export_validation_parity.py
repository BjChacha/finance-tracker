"""Export business-review parity including the separately tested date policy."""

import json
from datetime import datetime

from account_evidence import IDENTITY_CONFLICT, TRANSFER_BRIDGE, UNCERTAIN_ACCOUNT
from backend import ARTIFACTS, ROOT, write_json
from date_confirmation import UNSUPPORTED_CALENDAR, confirm_unsupported_date


def main():
    destination = ROOT / "src/features/transactions/natural-language"
    write_json(
        destination / "validation-patterns.json",
        {
            "transferBridge": TRANSFER_BRIDGE.pattern,
            "uncertainAccount": UNCERTAIN_ACCOUNT.pattern,
            "identityConflict": IDENTITY_CONFLICT.pattern,
            "unsupportedCalendar": UNSUPPORTED_CALENDAR.pattern,
        },
    )
    contexts, records = {}, []
    for name in (
        "qwen4b-unique-amount-regression-m098fe-ready",
        "qwen4b-unique-amount-guards-m098fe",
    ):
        folder = ARTIFACTS / name
        fixtures = json.loads((folder / "contexts.json").read_text(encoding="utf-8"))
        for line in (
            (folder / "predictions.jsonl").read_text(encoding="utf-8").splitlines()
        ):
            row = json.loads(line)
            key = name + "/" + row["expected"]["context_variant"]
            contexts[key] = fixtures[row["expected"]["context_variant"]]["context"]
            actual = confirm_unsupported_date(row["expected"]["text"], row["actual"])
            value = actual["validated"]
            records.append(
                {
                    "id": row["expected"]["id"],
                    "context": key,
                    "text": row["expected"]["text"],
                    "decision": {
                        k: v for k, v in actual["decision"].items() if k != "day"
                    },
                    "expected": {
                        "status": value["status"],
                        "amountCents": value["amount_cents"],
                        "amountEvidence": value["amount_evidence"],
                        "type": value["type"],
                        "categoryId": value["category"],
                        "accountId": value["account"],
                        "toAccountId": value["to_account"],
                        "note": value["note"],
                        "dateMs": int(
                            datetime.fromisoformat(value["date"]).timestamp() * 1000
                        )
                        if value["date"]
                        else None,
                        "issues": value["issues"],
                        "violations": value["violations"],
                    },
                }
            )
    write_json(
        destination / "__tests__/validation-parity.json",
        {"contexts": contexts, "records": records},
    )
    print(f"Exported {len(records)} validation records")


if __name__ == "__main__":
    main()
