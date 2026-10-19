"""Summarize candidate-label experiments without hiding model or gate errors."""

import json
import re

from backend import ARTIFACTS, evaluation, sha256, write_json


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def completed_run(name):
    folder = ARTIFACTS / name
    rows = [
        json.loads(line)
        for line in (folder / "predictions.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    ]
    summary = read_json(folder / "summary.json")
    if len(rows) != summary["total"]:
        raise ValueError(f"Incomplete run: {name}")
    return folder, rows, summary


def run_metrics(name):
    folder, rows, summary = completed_run(name)
    manifest = read_json(folder / "manifest.json")
    times = [row["actual"]["elapsed_ms"] for row in rows]
    samples = read_json(folder / "pss-samples.json")
    temperature = {}
    for key in ("battery_before", "battery_after"):
        match = re.search(r"temperature: (\d+)", manifest.get(key, ""))
        temperature[key] = int(match[1]) / 10 if match else None
    failures = []
    for row in rows:
        actual = row.get("scoring_actual", row["actual"])
        decision = actual.get("decision") or {}
        expected = row["expected"]
        wrong = [
            field
            for field in ("type", "category", "account", "to_account", "day", "status")
            if (decision.get(field) or "") != expected[field]
        ]
        if wrong:
            failures.append(
                {
                    "expected": expected,
                    "wrong_raw_fields": wrong,
                    "decision_level1": decision,
                    "gate_status": row["actual"].get("gate", {}).get("status"),
                    "validated": actual.get("validated"),
                    "input_guard": row["actual"].get("input_guard"),
                    "account_audit": row["actual"].get("account_audit"),
                }
            )
    return {
        "run": name,
        "summary": summary,
        "ready_ms": manifest.get("ready_ms"),
        "load_ms": manifest.get("load_ms"),
        "priming_ms": manifest.get("priming_ms"),
        "request_p50_ms": evaluation.percentile(times, 50),
        "request_p95_ms": evaluation.percentile(times, 95),
        "request_max_ms": max(times),
        "requests_over_3s": sum(value > 3000 for value in times),
        "peak_sampled_pss_bytes": max(s["pss_kib"] for s in samples) * 1024,
        "temperature_c": temperature,
        "code_rejections": sum("input_guard" in r["actual"] for r in rows),
        "account_confirmations": sum(
            bool(r["actual"].get("account_audit", {}).get("issues")) for r in rows
        ),
        "raw_field_failures": failures,
        "predictions_sha256": sha256(folder / "predictions.jsonl"),
    }


def power_comparison():
    _, reference, _ = completed_run("qwen4b-seed-catalog-dev")
    result = []
    for name in (
        "qwen4b-seed-catalog-dev",
        "qwen4b-seed-catalog-sustained-smoke",
        "qwen4b-seed-catalog-burst-smoke",
    ):
        _, rows, _ = completed_run(name)
        rows = rows[:10]
        times = [r["actual"]["elapsed_ms"] for r in rows]
        result.append(
            {
                "run": name,
                "count": len(rows),
                "request_bodies_equal": sum(
                    row["actual"]["request"] == baseline["actual"]["request"]
                    for row, baseline in zip(rows, reference)
                ),
                "decisions_equal": sum(
                    row["actual"]["decision"] == baseline["actual"]["decision"]
                    for row, baseline in zip(rows, reference)
                ),
                "mean_ms": sum(times) / len(times),
                "p95_ms": evaluation.percentile(times, 95),
                "max_ms": max(times),
            }
        )
    return result


def main():
    names = [
        "qwen4b-seed-label-dev",
        "qwen4b-seed-catalog-dev",
        "qwen4b-seed-catalog-sustained-smoke",
        "qwen4b-seed-catalog-burst-smoke",
        "qwen4b-guarded-catalog-dev",
        "qwen4b-guarded-catalog-guards",
        "qwen4b-guarded-sparse-catalog-dev",
        "qwen4b-guarded-sparse-catalog-guards",
        "qwen4b-example-sparse-catalog-dev",
        "qwen4b-example-sparse-catalog-guards",
        "qwen4b-catalog-frozen-regression",
        "qwen4b-catalog-frozen-guards",
    ]
    result = {
        "scope": "Observed development data; level-1 labels; native latency, not UI",
        "runs": [
            run_metrics(name)
            for name in names
            if (ARTIFACTS / name / "summary.json").exists()
        ],
        "power_smoke": power_comparison(),
        "isolated_example_gate": {
            name: read_json(ARTIFACTS / name / "gate-summary.json")
            for name in ("qwen4b-example-gate-dev", "qwen4b-example-gate-guards")
            if (ARTIFACTS / name / "gate-summary.json").exists()
        },
    }
    write_json(ARTIFACTS / "catalog-comparison.json", result)
    for run in result["runs"]:
        print(
            run["run"],
            {k: v["correct"] for k, v in run["summary"]["semantics"].items()},
            round(run["request_p95_ms"], 1),
            run["requests_over_3s"],
        )


if __name__ == "__main__":
    main()
