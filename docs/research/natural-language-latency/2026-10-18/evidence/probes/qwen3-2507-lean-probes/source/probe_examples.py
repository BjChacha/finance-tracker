"""Check named-account diagnostic probes; report status and unsafe complete previews."""

import argparse
import json
import shutil

from backend import (
    ARTIFACTS,
    HERE,
    MODEL,
    AcceleratedServer,
    contract,
    native,
    sha256,
    write_json,
)
from guard_examples import GuardExamplesClient


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--template", default="qwen35-official-template.jinja")
    parser.add_argument(
        "--format", choices=("lean", "guard-examples"), default="guard-examples"
    )
    args = parser.parse_args()
    native.SERIAL = args.serial
    output = ARTIFACTS / args.output
    output.mkdir(parents=True, exist_ok=False)
    probes = HERE.parent / "mobile_instruct/probes.json"
    rows = json.loads(probes.read_text(encoding="utf-8"))
    server = AcceleratedServer(
        "HTP0", args.model, batch=512, microbatch=512, template=args.template
    )
    if args.format == "lean":
        from lean import LeanClient

        server.client = LeanClient(server.port)
    else:
        server.client = GuardExamplesClient(server.port)
    snapshot = output / "source"
    snapshot.mkdir()
    for name in (
        "probe_examples.py",
        "guard_examples.py",
        "guard_examples.txt",
        "lean.py",
        "compact.py",
        "backend.py",
    ):
        shutil.copyfile(HERE / name, snapshot / name)
    records = []
    manifest = {
        "serial": args.serial,
        "probe_sha256": sha256(probes),
        "model": args.model,
        "format": args.format,
        "scope": "Previously observed status-only diagnostic probes, not an independent test",
    }
    try:
        with server:
            for row in rows:
                result = server.client.parse(
                    row["text"], contract.context_for({"context_variant": "default"})
                )
                records.append({"expected": row, "actual": result})
                print(
                    row["id"],
                    result["decision"],
                    result["validated"]["status"],
                    flush=True,
                )
        write_json(output / "predictions.json", records)
        manifest["correct_status"] = sum(
            r["actual"]["decision"]["status"] == r["expected"]["status"]
            for r in records
        )
        manifest["unsafe_complete"] = sum(
            r["expected"]["status"] == "clarify"
            and r["actual"]["validated"]["status"] == "preview"
            for r in records
        )
    finally:
        manifest["arguments"] = server.arguments
        manifest["environment"] = getattr(server, "environment", {})
        write_json(output / "manifest.json", manifest)
        write_json(output / "pss-samples.json", server.samples)
        write_json(output / "memory-errors.json", server.memory_errors)
        native.adb(
            "pull",
            f"{native.REMOTE}/{server.log}",
            str(output / "server.log"),
            check=False,
        )


if __name__ == "__main__":
    main()
