"""Freeze source and data, then run the authorized phone comparison serially."""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone

from runtime import ARTIFACTS, HERE, ROOT, sha256, write_json


def main():
    data = HERE.parent / "distribution_v1/data"
    paths = list(HERE.glob("*.py")) + list(HERE.glob("*.txt"))
    paths += [
        data / name for name in ("dev.tsv", "regression.tsv", "regression-guards.tsv")
    ]
    paths += [
        HERE.parent / "instruct/harness.py",
        HERE.parent / "data/context.json",
        ARTIFACTS / "upstream-chat_template.jinja",
        ARTIFACTS / "model-manifest.json",
    ]
    frozen = {p.relative_to(ROOT).as_posix(): sha256(p) for p in paths}
    path = ARTIFACTS / "freeze.json"
    if path.exists():
        raise FileExistsError("Refusing to overwrite an earlier freeze")
    write_json(
        path,
        {
            "at": datetime.now(timezone.utc).isoformat(),
            "files": frozen,
            "selection": "Zero-shot prompt; 10 dev smoke cases; no regression-specific tuning",
            "scope": "Synthetic observed regression, pending human review",
        },
    )
    jobs = [
        (
            "evaluate.py",
            ["--data", str(data / "regression.tsv"), "--output", "regression"],
        ),
        (
            "evaluate.py",
            ["--data", str(data / "regression-guards.tsv"), "--output", "guards"],
        ),
        ("benchmark.py", ["--data", str(data / "dev.tsv"), "--output", "performance"]),
    ]
    for script, arguments in jobs:
        if any(sha256(ROOT / name) != digest for name, digest in frozen.items()):
            raise ValueError("Frozen source or data changed")
        print(f"Starting {script} {json.dumps(arguments)}", flush=True)
        subprocess.run(
            [sys.executable, str(HERE / script), *arguments],
            check=True,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )


if __name__ == "__main__":
    main()
