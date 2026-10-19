"""Verify observed guard blind spots on the explicitly selected Android device."""

import argparse
import json

from runtime import ARTIFACTS, HERE, contract, native, sha256, write_json
from safe_constraints import SafeDevice


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    native.SERIAL = args.serial
    output = ARTIFACTS / args.output
    output.mkdir(parents=True, exist_ok=False)
    rows = json.loads((HERE / "probes.json").read_text(encoding="utf-8"))
    write_json(
        output / "manifest.json",
        {
            "serial": args.serial,
            "source_hashes": {
                name: sha256(HERE / name)
                for name in (
                    "device_probes.py",
                    "probes.json",
                    "safe_constraints.py",
                    "branch_constraints.py",
                    "runtime.py",
                    "device_runtime.py",
                    "prompt.txt",
                )
            },
            "scope": "Six observed diagnostic probes, not part of main or guard accuracy",
        },
    )
    records = []
    server = SafeDevice()
    try:
        with (
            server,
            (output / "predictions.jsonl").open("w", encoding="utf-8") as stream,
        ):
            for row in rows:
                actual = server.client.parse(row["text"], contract.default_context())
                records.append({"expected": row, "actual": actual})
                stream.write(json.dumps(records[-1], ensure_ascii=False) + "\n")
                stream.flush()
                if not actual["schema_valid"]:
                    raise ValueError(actual.get("error"))
                print(row["id"], actual["decision"], flush=True)
    finally:
        write_json(output / "pss-samples.json", server.samples)
        write_json(output / "memory-errors.json", server.memory_errors)
        native.adb(
            "pull",
            f"{native.REMOTE}/comparison-qwen.log",
            str(output / "server.log"),
            check=False,
        )
    write_json(
        output / "summary.json",
        {
            "total": len(records),
            "correct_status": sum(
                row["actual"]["decision"]["status"] == row["expected"]["status"]
                for row in records
            ),
            "unsafe_previews": sum(
                row["actual"]["validated"]["status"] == "preview"
                and row["expected"]["status"] == "clarify"
                for row in records
            ),
        },
    )


if __name__ == "__main__":
    main()
