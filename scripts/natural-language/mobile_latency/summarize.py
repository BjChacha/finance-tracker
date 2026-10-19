"""Build auditable experiment metrics without conflating native and UI latency."""

import json

from backend import ARTIFACTS, evaluation, sha256, write_json


def main():
    table = []
    for folder in sorted(ARTIFACTS.iterdir()):
        summary_file = folder / "summary.json"
        predictions = folder / "predictions.jsonl"
        if not summary_file.exists() or not predictions.exists():
            continue
        records = [
            json.loads(line)
            for line in predictions.read_text(encoding="utf-8").splitlines()
        ]
        summary = json.loads(summary_file.read_text(encoding="utf-8"))
        if len(records) != summary["total"]:
            raise ValueError(f"Incomplete results: {folder.name}")
        times = [row["actual"]["elapsed_ms"] for row in records]
        warm = times[1:]
        manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
        table.append(
            {
                "run": folder.name,
                "count": len(records),
                "amount": summary["semantics"]["amount_cents"]["correct"],
                "type": summary["semantics"]["type"]["correct"],
                "category": summary["semantics"]["category"]["correct"],
                "guards": summary["guards"],
                "process_cold_first_ms": manifest.get("process_cold_first_result_ms"),
                "request_p50_ms": evaluation.percentile(times, 50),
                "request_p95_ms": evaluation.percentile(times, 95),
                "subsequent_p95_ms": evaluation.percentile(warm, 95) if warm else None,
                "subsequent_max_ms": max(warm) if warm else None,
                "subsequent_over_3s": sum(value > 3000 for value in warm),
                "source_predictions_sha256": sha256(predictions),
                "scope": "Sequential native model requests; not app UI; not a randomized repeated performance benchmark",
            }
        )
    write_json(ARTIFACTS / "experiment-metrics.json", table)
    for row in table:
        if row["count"] == 100:
            print(
                row["run"],
                row["amount"],
                row["type"],
                row["category"],
                round(row["request_p95_ms"], 1),
                flush=True,
            )


if __name__ == "__main__":
    main()
