"""Download pinned published quantization and upstream license with verification."""

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "jev_harness"))
from bridge import sha256, write_json
from fetch_model import parallel_fetch
from support import baseline_fetch

ARTIFACTS = ROOT / "artifacts/natural-language-mobile-instruct"
REPO = "unsloth/Qwen3.5-4B-GGUF"
REVISION = "e87f176479d0855a907a41277aca2f8ee7a09523"
UPSTREAM = "Qwen/Qwen3.5-4B"
UPSTREAM_REVISION = "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a"
MODEL = "Qwen3.5-4B-Q4_K_M.gguf"
MODEL_SHA256 = "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4"
MODEL_BYTES = 2740937888


def read_url(url):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=60) as response:
        return response.read()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    entries = []
    for repo, revision, names, prefix in (
        (REPO, REVISION, ["README.md"], "quantization"),
        (
            UPSTREAM,
            UPSTREAM_REVISION,
            ["README.md", "LICENSE", "chat_template.jinja"],
            "upstream",
        ),
    ):
        metadata = json.loads(
            read_url(
                f"https://huggingface.co/api/models/{repo}/revision/{revision}?blobs=true"
            )
        )
        if metadata["sha"] != revision:
            raise ValueError("Unexpected model revision")
        write_json(ARTIFACTS / f"{prefix}-metadata.json", metadata)
        for name in names:
            item = next(row for row in metadata["siblings"] if row["rfilename"] == name)
            data = read_url(f"https://huggingface.co/{repo}/resolve/{revision}/{name}")
            digest = hashlib.sha1(
                b"blob " + str(len(data)).encode() + b"\0" + data
            ).hexdigest()
            if digest != item["blobId"]:
                raise ValueError(f"Blob verification failed: {name}")
            path = ARTIFACTS / f"{prefix}-{name}"
            path.write_bytes(data)
            entries.append({"path": path.name, "sha256": sha256(path)})
    target = ARTIFACTS / MODEL
    parallel_fetch(
        f"https://huggingface.co/{REPO}/resolve/{REVISION}/{MODEL}",
        target,
        MODEL_SHA256,
        MODEL_BYTES,
        baseline_fetch,
    )
    write_json(
        ARTIFACTS / "model-manifest.json",
        {
            "repository": REPO,
            "revision": REVISION,
            "upstream": UPSTREAM,
            "upstream_revision": UPSTREAM_REVISION,
            "model": MODEL,
            "bytes": target.stat().st_size,
            "sha256": sha256(target),
            "license": "Apache-2.0",
            "supporting_files": entries,
            "scope": "Text-only GGUF; no vision projector; no project fine-tuning",
        },
    )


if __name__ == "__main__":
    main()
