"""Summarize the alternating experiment without substituting tensor timings for startup."""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from backend import ARTIFACTS, evaluation, write_json


def main():
    folder = ARTIFACTS / "qwen4b-repack-comparison-ready"
    rows = json.loads((folder / "runs.json").read_text(encoding="utf-8"))
    if len(rows) != 10 or not all(row["decisions_equal"] for row in rows):
        raise ValueError("Expected ten completed runs with decision parity")
    results = []
    for threads in (1, 8):
        group = [row for row in rows if row["threads"] == threads]
        cold = [row["first_result_ms"] for row in group]
        load = [row["load_ms"] for row in group]
        warm = [latency for row in group for latency in row["request_ms"][1:]]
        results.append(
            {
                "threads": threads,
                "cold_count": len(cold),
                "warm_count": len(warm),
                "load_p50_ms": evaluation.percentile(load, 50),
                "load_p95_ms": evaluation.percentile(load, 95),
                "first_result_p50_ms": evaluation.percentile(cold, 50),
                "first_result_p95_ms": evaluation.percentile(cold, 95),
                "warm_p95_ms": evaluation.percentile(warm, 95),
                "cold_over_3s": sum(value > 3000 for value in cold),
                "warm_over_3s": sum(value > 3000 for value in warm),
            }
        )
    write_json(
        folder / "comparison.json",
        {
            "scope": "Same custom build, alternating process-cold runs, file caches retained; no application UI",
            "results": results,
            "decision": "Do not adopt: eight-worker loading did not improve end-to-end cold latency",
        },
    )
    print(json.dumps(results, indent=2), flush=True)


if __name__ == "__main__":
    main()
