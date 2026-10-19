"""Compare matched speculation diagnostics without claiming a controlled benchmark."""

import json
import re
import statistics

from backend import ARTIFACTS, sha256, write_json


def rows_for(name):
    path = ARTIFACTS / name / "predictions.jsonl"
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()][
        :10
    ]


def main():
    baseline = rows_for("qwen4b-lean-dev")
    results = []
    for name in ("qwen4b-lean-dev", "qwen4b-ngram2-smoke", "qwen4b-static-cache-smoke"):
        rows = rows_for(name)
        if len(rows) != len(baseline) or any(
            a["expected"] != b["expected"] for a, b in zip(baseline, rows)
        ):
            raise ValueError("Mismatched diagnostic inputs")
        warm = [r["actual"]["elapsed_ms"] for r in rows[1:]]
        accepted = re.findall(
            r"draft acceptance = [\d.]+ \(\s*(\d+) accepted /\s*(\d+) generated\)",
            (ARTIFACTS / name / "server.log").read_text(encoding="utf-8"),
        )
        manifest = json.loads(
            (ARTIFACTS / name / "manifest.json").read_text(encoding="utf-8")
        )
        results.append(
            {
                "run": name,
                "count": len(rows),
                "decisions_equal": sum(
                    a["actual"]["decision"] == b["actual"]["decision"]
                    for a, b in zip(baseline, rows)
                ),
                "request_bodies_equal": sum(
                    a["actual"]["request"] == b["actual"]["request"]
                    for a, b in zip(baseline, rows)
                ),
                "subsequent_count": len(warm),
                "subsequent_mean_ms": statistics.mean(warm),
                "subsequent_max_ms": max(warm),
                "cold_first_ms": manifest["process_cold_first_result_ms"],
                "draft_accepted": sum(int(pair[0]) for pair in accepted),
                "draft_generated": sum(int(pair[1]) for pair in accepted),
                "source_sha256": sha256(ARTIFACTS / name / "predictions.jsonl"),
            }
        )
    write_json(
        ARTIFACTS / "speculation-comparison.json",
        {
            "scope": "Same first ten development cases and model; separate sequential diagnostics, not repeated randomized performance evidence",
            "results": results,
        },
    )
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
