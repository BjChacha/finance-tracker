"""Fetch the same published 4B model with a uniform four-bit quantization."""

import importlib.util
import json

from backend import ARTIFACTS, HERE, ROOT, sha256, write_json
from support import baseline_fetch

MODEL = "Qwen3.5-4B-Q4_0.gguf"
REVISION = "e87f176479d0855a907a41277aca2f8ee7a09523"


def main():
    metadata_path = (
        ROOT / "artifacts/natural-language-mobile-instruct/quantization-metadata.json"
    )
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if metadata["sha"] != REVISION:
        raise ValueError("Unexpected quantization repository revision")
    entry = next(row for row in metadata["siblings"] if row["rfilename"] == MODEL)
    spec = importlib.util.spec_from_file_location(
        "parallel_helper", HERE.parent / "jev/fetch_model.py"
    )
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    folder = ARTIFACTS / "qwen35-4b-q4_0"
    folder.mkdir(exist_ok=True)
    helper.parallel_fetch(
        f"https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/{REVISION}/{MODEL}",
        folder / MODEL,
        entry["lfs"]["sha256"],
        entry["size"],
        baseline_fetch,
    )
    write_json(
        folder / "manifest.json",
        {
            "repository": "unsloth/Qwen3.5-4B-GGUF",
            "revision": REVISION,
            "file": MODEL,
            "bytes": entry["size"],
            "sha256": sha256(folder / MODEL),
            "metadata_sha256": sha256(metadata_path),
            "scope": "Published quantization of the same 4B checkpoint; no training",
        },
    )


if __name__ == "__main__":
    main()
