"""Aggregate complete runs with verified sample identity and explicit provenance."""

import json
import sys

from runtime import ARTIFACTS, HERE, ROOT, evaluation, sha256, write_json

sys.path.insert(0, str(HERE.parent / "distribution_v1"))
from dataset import read_rows
from score import check_records, guard_metrics, summarize


def load(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def parity(left, right):
    other = {r["expected"]["id"]: r for r in right}
    if set(other) != {r["expected"]["id"] for r in left}:
        raise ValueError("Paired runs have different samples")
    differing = []
    for row in left:
        peer = other[row["expected"]["id"]]
        fields = [
            key
            for key in row["actual"]["decision"]
            if row["actual"]["decision"][key] != peer["actual"]["decision"][key]
        ]
        if fields:
            differing.append(
                {
                    "id": row["expected"]["id"],
                    "fields": fields,
                    "left": row["actual"]["decision"],
                    "right": peer["actual"]["decision"],
                }
            )
    return {
        "total": len(left),
        "equal_decisions": len(left) - len(differing),
        "differences": differing,
    }


def main():
    result = {"models": {}, "performance": {}, "parity": {}, "sources": {}}
    runs = {}
    for kind in ("jev", "qwen", "branch"):
        records = load(ARTIFACTS / f"tablet-{kind}-regression/predictions.jsonl")
        guards = load(ARTIFACTS / f"tablet-{kind}-guards/predictions.jsonl")
        check_records(
            records, read_rows(HERE.parent / "distribution_v1/data/regression.tsv")
        )
        check_records(
            guards,
            read_rows(HERE.parent / "distribution_v1/data/regression-guards.tsv"),
        )
        runs[kind] = records
        summary = evaluation.summarize(records)
        summary["device_latency_ms"] = summary.pop("observed_desktop_latency_ms")
        result["models"][kind] = {
            "summary": summary,
            "distribution": summarize(records),
            "guards": guard_metrics(guards),
        }
        for suffix in ("regression", "guards"):
            path = ARTIFACTS / f"tablet-{kind}-{suffix}/predictions.jsonl"
            result["sources"][str(path.relative_to(ROOT))] = sha256(path)
    for kind in ("jev", "qwen"):
        folder = ARTIFACTS / f"tablet-{kind}-performance"
        summary = json.loads((folder / "summary.json").read_text(encoding="utf-8"))
        samples = json.loads((folder / "pss-samples.json").read_text(encoding="utf-8"))
        warm = [s["pss_kib"] * 1024 for s in samples if s["phase"] == "warm"]
        summary["warm_process_pss_p50_bytes"] = evaluation.percentile(warm, 50)
        summary["warm_process_pss_p95_bytes"] = evaluation.percentile(warm, 95)
        result["performance"][kind] = summary
    prior = load(
        ROOT
        / "artifacts/natural-language-jev-harness/distribution-v1-scored/conservative/predictions.jsonl"
    )
    result["parity"]["jev_redmi_to_tablet"] = parity(prior, runs["jev"])
    result["parity"]["qwen_schema_to_branch_tablet"] = parity(
        runs["qwen"], runs["branch"]
    )
    for kind, folder in (
        ("qwen", "desktop-regression"),
        ("branch", "desktop-branch-regression"),
    ):
        result["parity"][f"{kind}_desktop_to_tablet"] = parity(
            load(ARTIFACTS / folder / "predictions.jsonl"), runs[kind]
        )
    write_json(ARTIFACTS / "final-comparison.json", result)
    for kind, data in result["models"].items():
        print(kind, data["distribution"]["aggregate"]["empirical"], data["guards"])


if __name__ == "__main__":
    main()
