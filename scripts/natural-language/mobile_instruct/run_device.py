"""Freeze and execute both models on the explicitly selected replacement device."""

import argparse
import os
import subprocess
import sys
from datetime import datetime, timezone

from runtime import ARTIFACTS, HERE, sha256, write_json


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--serial", required=True)
    args = ap.parse_args()
    data = HERE.parent / "distribution_v1/data"
    names = [
        "runtime.py",
        "prompt.txt",
        "device_runtime.py",
        "device_compare.py",
        "device_benchmark.py",
        "benchmark.py",
        "run_device.py",
    ]
    frozen = {name: sha256(HERE / name) for name in names}
    path = ARTIFACTS / "device-freeze.json"
    if path.exists():
        raise FileExistsError("Refusing to replace a frozen comparison")
    write_json(
        path,
        {
            "at": datetime.now(timezone.utc).isoformat(),
            "serial": args.serial,
            "source_hashes": frozen,
            "semantic_freeze": "freeze.json",
            "selection": "Memory parameters only; no semantic prompt changes after ten dev smoke cases",
        },
    )
    jobs = []
    for kind in ("qwen", "jev"):
        for filename, suffix in (
            ("regression.tsv", "regression"),
            ("regression-guards.tsv", "guards"),
        ):
            jobs.append(
                ("device_compare.py", kind, filename, f"tablet-{kind}-{suffix}")
            )
    for kind in ("jev", "qwen"):
        jobs.append(
            ("device_benchmark.py", kind, "dev.tsv", f"tablet-{kind}-performance")
        )
    for script, kind, filename, output in jobs:
        if any(sha256(HERE / name) != digest for name, digest in frozen.items()):
            raise ValueError("Frozen device runtime changed")
        print(f"Starting {output}", flush=True)
        subprocess.run(
            [
                sys.executable,
                str(HERE / script),
                "--serial",
                args.serial,
                "--kind",
                kind,
                "--data",
                str(data / filename),
                "--output",
                output,
            ],
            check=True,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )


if __name__ == "__main__":
    main()
