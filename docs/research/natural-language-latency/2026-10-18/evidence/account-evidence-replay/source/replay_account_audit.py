"""Replay a confirmation-only account audit over retained model predictions."""

import copy
import json
import shutil
from collections import Counter

from account_evidence import attach_account_audit
from backend import ARTIFACTS, HERE, contract, sha256, write_json

RUNS = (
    "qwen4b-lean-dev",
    "qwen4b-example-dev",
    "qwen4b-lean-dev-guards",
    "qwen4b-example-guards",
    "qwen4b-example-named-probes",
)


def main():
    output = ARTIFACTS / "account-evidence-replay"
    output.mkdir(exist_ok=False)
    snapshot = output / "source"
    snapshot.mkdir()
    for name in (
        "account_evidence.py",
        "test_account_evidence.py",
        "replay_account_audit.py",
    ):
        shutil.copyfile(HERE / name, snapshot / name)
    manifest = {
        "scope": "Offline validation replay of observed synthetic data, no new model inference or semantic accuracy improvement",
        "inputs": {},
        "source_hashes": {p.name: sha256(p) for p in snapshot.iterdir()},
        "context_sha256": sha256(HERE.parent / "data/context.json"),
        "validator_sha256": sha256(HERE.parent / "instruct/harness.py"),
    }
    summaries = []
    for name in RUNS:
        source = ARTIFACTS / name / "predictions.jsonl"
        if source.exists():
            records = [
                json.loads(line)
                for line in source.read_text(encoding="utf-8").splitlines()
            ]
        else:
            source = source.with_suffix(".json")
            records = json.loads(source.read_text(encoding="utf-8"))
        manifest["inputs"][name] = sha256(source)
        audited = []
        summary = Counter()
        for record in records:
            expected, actual = record["expected"], record["actual"]
            original = copy.deepcopy(actual)
            outcome = attach_account_audit(
                expected["text"], contract.context_for(expected), actual
            )
            if actual != original:
                raise ValueError("Audit mutated original inference evidence")
            audited.append({"expected": expected, **outcome})
            summary["total"] += 1
            before = actual["validated"]["status"] == "preview"
            after = outcome["preview_ready"]
            summary["complete_before"] += before
            summary["complete_after"] += after
            summary["new_confirmation"] += before and not after
            summary["flagged_records"] += bool(outcome["account_audit"]["issues"])
            guard = expected["status"] == "clarify"
            summary["guard_complete_before"] += guard and before
            summary["guard_complete_after"] += guard and after
            if not guard and all(
                field in expected for field in ("account", "to_account")
            ):
                accounts_correct = all(
                    (expected[field] or None) == actual["decision"][field]
                    for field in ("account", "to_account")
                )
                summary["correct_accounts_flagged"] += accounts_correct and bool(
                    outcome["account_audit"]["issues"]
                )
        with (output / f"{name}.jsonl").open("w", encoding="utf-8") as stream:
            for record in audited:
                stream.write(json.dumps(record, ensure_ascii=False) + "\n")
        summaries.append({"run": name, **summary})
    write_json(output / "manifest.json", manifest)
    write_json(output / "comparison.json", summaries)
    print(json.dumps(summaries, indent=2), flush=True)


if __name__ == "__main__":
    main()
