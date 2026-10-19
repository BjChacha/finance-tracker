"""Export device responses and Python grammar hashes without rerunning inference."""

import hashlib
import json

from backend import ARTIFACTS, ROOT, sha256, write_json
from unique_amount import UniqueAmountContract


def main():
    records, contexts, sources = [], {}, {}
    source = ROOT / "scripts/natural-language"
    prompt = (source / "mobile_instruct/prompt.txt").read_text(encoding="utf-8")
    prefix = "\n".join(
        line for line in (prompt + "\n").splitlines() if not line.startswith("day")
    )
    prefix = prefix.replace("to_account\u3001day\u3001status", "to_account\u3001status")
    write_json(
        ROOT / "src/features/transactions/natural-language/prompts.json",
        {
            "fieldsPrefix": prefix,
            "fieldsSuffix": (source / "mobile_latency/unique_amount.txt").read_text(
                encoding="utf-8"
            ),
            "gatePrefix": (source / "mobile_latency/gate_prompt.txt").read_text(
                encoding="utf-8"
            ),
            "gateSuffix": (source / "mobile_latency/gate_examples.txt").read_text(
                encoding="utf-8"
            ),
        },
    )
    for run in (
        "qwen4b-unique-amount-regression-m098fe-ready",
        "qwen4b-unique-amount-guards-m098fe",
    ):
        folder = ARTIFACTS / run
        context_file = folder / "contexts.json"
        prediction_file = folder / "predictions.jsonl"
        fixtures = json.loads(context_file.read_text(encoding="utf-8"))
        for path in (context_file, prediction_file):
            sources[str(path.relative_to(ROOT))] = sha256(path)
        for line in prediction_file.read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            if not row["actual"]["extraction_performed"]:
                continue
            key = run + "/" + row["expected"]["context_variant"]
            context = fixtures[row["expected"]["context_variant"]]["context"]
            contexts[key] = context
            mapping = UniqueAmountContract(row["expected"]["text"], context)
            response = row["actual"]["response"]
            decision = mapping.decode(response)
            decision.pop("day")
            requests = {}
            for name, body in (
                ("fields", row["actual"]["request"]),
                ("gate", row["actual"]["gate"]["request"]),
            ):
                requests[name] = {
                    "options": {
                        key: value
                        for key, value in body.items()
                        if key not in ("messages", "grammar")
                    },
                    "messages": [
                        {
                            "role": message["role"],
                            "sha256": hashlib.sha256(
                                message["content"].encode()
                            ).hexdigest(),
                        }
                        for message in body["messages"]
                    ],
                }
            records.append(
                {
                    "id": row["expected"]["id"],
                    "context": key,
                    "text": row["expected"]["text"],
                    "response": response,
                    "decision": decision,
                    "requests": requests,
                    "grammar_sha256": hashlib.sha256(
                        mapping.grammar().encode()
                    ).hexdigest(),
                }
            )
    write_json(
        ROOT / "src/features/transactions/natural-language/__tests__/field-parity.json",
        {"sources": sources, "contexts": contexts, "records": records},
    )
    print(f"Exported {len(records)} field contracts")


if __name__ == "__main__":
    main()
