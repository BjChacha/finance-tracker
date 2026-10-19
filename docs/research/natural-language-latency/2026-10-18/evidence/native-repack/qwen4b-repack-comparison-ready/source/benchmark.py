"""Compare process-cold loading in alternating serial and parallel runs."""

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from backend import (
    ARTIFACTS,
    AcceleratedServer,
    contract,
    evaluation,
    native,
    write_json,
)
from lean import LeanClient


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--package", default="snapdragon-repack-b11669-v2")
    args = parser.parse_args()
    native.SERIAL = args.serial
    output = ARTIFACTS / args.output
    output.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(
        ARTIFACTS / args.package / "manifest.json", output / "runtime-manifest.json"
    )
    snapshot = output / "source"
    snapshot.mkdir()
    for source in (
        HERE / "benchmark.py",
        HERE / "parallel-q4_0.patch",
        HERE.parent / "backend.py",
        HERE.parent / "lean.py",
    ):
        shutil.copyfile(source, snapshot / source.name)
    rows = evaluation.load_rows(HERE.parent.parent / "distribution_v1/data/dev.tsv")[:3]
    records = []
    reference = None
    try:
        for repeat in range(args.repeats):
            for threads in (1, 8) if repeat % 2 == 0 else (8, 1):
                run = output / f"run-{repeat}-threads-{threads}"
                run.mkdir()
                server = AcceleratedServer(
                    "HTP0",
                    "Qwen3.5-4B-Q4_0.gguf",
                    512,
                    512,
                    package=args.package,
                    repack_threads=threads,
                )
                server.client = LeanClient(server.port)
                result = {
                    "repeat": repeat,
                    "threads": threads,
                    "battery_before": native.adb("shell", "dumpsys", "battery").stdout,
                }
                try:
                    with server:
                        result["load_ms"] = server.load_ms
                        predictions = []
                        for row in rows:
                            actual = server.client.parse(
                                row["text"], contract.context_for(row)
                            )
                            predictions.append({"expected": row, "actual": actual})
                            if len(predictions) == 1:
                                result["first_result_ms"] = (
                                    time.perf_counter() - server.started
                                ) * 1000
                        write_json(run / "predictions.json", predictions)
                        decisions = [
                            record["actual"]["decision"] for record in predictions
                        ]
                        if reference is None:
                            reference = decisions
                        result["decisions_equal"] = decisions == reference
                        result["request_ms"] = [
                            record["actual"]["elapsed_ms"] for record in predictions
                        ]
                        if not result["decisions_equal"]:
                            raise RuntimeError("Serial/parallel decisions differ")
                finally:
                    result["environment"] = getattr(server, "environment", {})
                    result["arguments"] = server.arguments
                    write_json(run / "manifest.json", result)
                    write_json(run / "pss-samples.json", server.samples)
                    write_json(run / "memory-errors.json", server.memory_errors)
                    native.adb(
                        "pull",
                        f"{native.REMOTE}/{server.log}",
                        str(run / "server.log"),
                        check=False,
                    )
                records.append(result)
                print(json.dumps(result, ensure_ascii=True), flush=True)
    finally:
        write_json(output / "runs.json", records)


if __name__ == "__main__":
    main()
