"""Freeze the selected development protocol before observing comparison results."""

import argparse
from datetime import UTC, datetime
from pathlib import Path

from support import ARTIFACTS, HERE, ROOT, sha256, write_json


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompts", required=True)
    args = ap.parse_args()
    selected = Path(args.prompts)
    original = HERE / "prompts-v1.json"
    if not original.exists():
        original.write_bytes((HERE / "prompts.json").read_bytes())
    (HERE / "prompts.json").write_bytes(selected.read_bytes())
    paths = [
        *[
            HERE / name
            for name in (
                "decision.py",
                "encoder.py",
                "support.py",
                "evaluation.py",
                "device_benchmark.py",
                "prompts.json",
            )
        ],
        HERE.parent / "data/dev.tsv",
        HERE.parent / "data/context.json",
        HERE.parent / "instruct/heldout.tsv",
        HERE.parent / "instruct/harness.py",
        HERE.parent / "instruct/evaluate.py",
        HERE.parent / "money.py",
    ]
    write_json(
        HERE / "freeze.json",
        {
            "frozen_at": datetime.now(UTC).isoformat(),
            "selected_prompts": selected.name,
            "files": {
                str(path.relative_to(ROOT)).replace("\\", "/"): sha256(path)
                for path in paths
            },
            "comparison_scope": "Previously observed synthetic 200-row benchmark; not an independent blind test; human review pending.",
            "tuning": "Development data only; no project fine-tuning or quantization calibration.",
        },
    )
    models = sorted((ARTIFACTS / "models").glob("*.gguf"))
    write_json(
        ARTIFACTS / "all-models.json",
        [
            {"name": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)}
            for path in models
        ],
    )


if __name__ == "__main__":
    main()
