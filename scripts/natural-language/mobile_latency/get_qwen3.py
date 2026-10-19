"""Fetch an official Qwen3 small-model comparison and its exact chat template."""

import hashlib
import importlib.util
import json
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
FOLDER = ROOT / "artifacts/natural-language-latency/qwen3-1.7b"
REPOSITORY = "Qwen/Qwen3-1.7B-GGUF"
REVISION = "90862c4b9d2787eaed51d12237eafdfe7c5f6077"
MODEL = "Qwen3-1.7B-Q8_0.gguf"
DIGEST = "061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a"
SIZE = 1834426016


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_url(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def main():
    FOLDER.mkdir(parents=True, exist_ok=True)
    metadata_path = FOLDER / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if metadata["sha"] != REVISION:
        raise ValueError("Unexpected official quantization revision")
    upstream_path = FOLDER / "upstream-metadata.json"
    if not upstream_path.exists():
        upstream_path.write_bytes(
            read_url("https://huggingface.co/api/models/Qwen/Qwen3-1.7B?blobs=true")
        )
    upstream = json.loads(upstream_path.read_text(encoding="utf-8"))
    sources = []
    for name in (
        "README.md",
        "LICENSE",
        "tokenizer_config.json",
        "tokenizer.json",
        "config.json",
    ):
        entry = next(item for item in upstream["siblings"] if item["rfilename"] == name)
        path = FOLDER / name
        if not path.exists():
            path.write_bytes(
                read_url(
                    f"https://huggingface.co/Qwen/Qwen3-1.7B/resolve/{upstream['sha']}/{name}"
                )
            )
        payload = path.read_bytes()
        blob = hashlib.sha1(
            b"blob " + str(len(payload)).encode() + b"\0" + payload
        ).hexdigest()
        matches = (
            hashlib.sha256(payload).hexdigest() == entry["lfs"]["sha256"]
            if "lfs" in entry
            else blob == entry["blobId"]
        )
        if not matches:
            raise ValueError(f"Upstream blob mismatch: {name}")
        sources.append({"file": name, "sha256": hashlib.sha256(payload).hexdigest()})
    template = json.loads(
        (FOLDER / "tokenizer_config.json").read_text(encoding="utf-8")
    )["chat_template"]
    if not isinstance(template, str) or "enable_thinking" not in template:
        raise ValueError("Unexpected official chat template")
    (FOLDER / "chat_template.jinja").write_text(template, encoding="utf-8")
    helper = load_module("qwen3_fetch_helper", HERE.parent / "jev/fetch_model.py")
    baseline = load_module("qwen3_hash_helper", HERE.parent / "instruct/fetch.py")
    helper.parallel_fetch(
        f"https://huggingface.co/{REPOSITORY}/resolve/{REVISION}/{MODEL}",
        FOLDER / MODEL,
        DIGEST,
        SIZE,
        baseline,
    )
    manifest = {
        "repository": REPOSITORY,
        "revision": REVISION,
        "upstream": "Qwen/Qwen3-1.7B",
        "upstream_revision": upstream["sha"],
        "file": MODEL,
        "sha256": DIGEST,
        "bytes": SIZE,
        "template_sha256": baseline.sha256(FOLDER / "chat_template.jinja"),
        "supporting": sources,
        "license": "Apache-2.0",
        "scope": "Official published Q8_0 comparison; no training; quality not yet measured",
    }
    (FOLDER / "manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
