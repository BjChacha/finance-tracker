"""Fetch a pinned small Chinese model suitable for accelerator comparisons."""

import hashlib
import importlib.util
import json
import urllib.request

from backend import ARTIFACTS, HERE, sha256, write_json
from support import baseline_fetch

REPOSITORY = "unsloth/Qwen3.5-2B-GGUF"
REVISION = "f6d5376be1edb4d416d56da11e5397a961aca8ae"
UPSTREAM = "Qwen/Qwen3.5-2B"
UPSTREAM_REVISION = "15852e8c16360a2fea060d615a32b45270f8a8fc"
MODEL = "Qwen3.5-2B-Q4_0.gguf"
DIGEST = "cd70221bebaee0503e0f6717e174250cd7825aa88438b3aabec9ad55731d9bb1"
SIZE = 1214873856


def read_url(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def main():
    folder = ARTIFACTS / "qwen35-2b"
    folder.mkdir(parents=True, exist_ok=True)
    metadata = json.loads(
        read_url(
            f"https://huggingface.co/api/models/{UPSTREAM}/revision/{UPSTREAM_REVISION}?blobs=true"
        )
    )
    if metadata["sha"] != UPSTREAM_REVISION:
        raise ValueError("Unexpected upstream revision")
    supporting = []
    for name in ("README.md", "LICENSE", "chat_template.jinja"):
        item = next(row for row in metadata["siblings"] if row["rfilename"] == name)
        payload = read_url(
            f"https://huggingface.co/{UPSTREAM}/resolve/{UPSTREAM_REVISION}/{name}"
        )
        actual = hashlib.sha1(
            b"blob " + str(len(payload)).encode() + b"\0" + payload
        ).hexdigest()
        if actual != item["blobId"]:
            raise ValueError(f"Upstream blob mismatch: {name}")
        (folder / name).write_bytes(payload)
        supporting.append({"name": name, "sha256": sha256(folder / name)})
    expected_template = (
        "273d8e0e683b885071fb17e08d71e5f2a5ddfb5309756181681de4f5a1822d80"
    )
    if sha256(folder / "chat_template.jinja") != expected_template:
        raise ValueError("Model requires a separate chat template")
    spec = importlib.util.spec_from_file_location(
        "latency_fetch_helpers", HERE.parent / "jev/fetch_model.py"
    )
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    helper.parallel_fetch(
        f"https://huggingface.co/{REPOSITORY}/resolve/{REVISION}/{MODEL}",
        folder / MODEL,
        DIGEST,
        SIZE,
        baseline_fetch,
    )
    write_json(
        folder / "manifest.json",
        {
            "repository": REPOSITORY,
            "revision": REVISION,
            "upstream": UPSTREAM,
            "upstream_revision": UPSTREAM_REVISION,
            "file": MODEL,
            "sha256": DIGEST,
            "bytes": SIZE,
            "supporting": supporting,
            "license": "Apache-2.0",
            "scope": "Published Q4_0 quantization, no project fine-tuning",
        },
    )


if __name__ == "__main__":
    main()
