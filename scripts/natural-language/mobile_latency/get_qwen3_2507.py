"""Fetch a pinned non-thinking Qwen3 comparison with the official tokenizer template."""

import hashlib
import json

from get_qwen3 import ROOT, load_module, read_url

FOLDER = ROOT / "artifacts/natural-language-latency/qwen3-4b-2507"
REPOSITORY = "unsloth/Qwen3-4B-Instruct-2507-GGUF"
REVISION = "a06e946bb6b655725eafa393f4a9745d460374c9"
UPSTREAM = "Qwen/Qwen3-4B-Instruct-2507"
UPSTREAM_REVISION = "cdbee75f17c01a7cc42f958dc650907174af0554"
MODEL = "Qwen3-4B-Instruct-2507-Q4_0.gguf"
DIGEST = "e0ba675d86ab277c61701c6793659b2ae801d95e3be791464c321e6fbf613be2"
SIZE = 2375773280


def main():
    FOLDER.mkdir(parents=True, exist_ok=True)
    metadata = json.loads((FOLDER / "metadata.json").read_text(encoding="utf-8"))
    upstream = json.loads(
        (FOLDER / "upstream-metadata.json").read_text(encoding="utf-8")
    )
    if metadata["sha"] != REVISION or upstream["sha"] != UPSTREAM_REVISION:
        raise ValueError("Pinned model revision mismatch")
    weight = next(row for row in metadata["siblings"] if row["rfilename"] == MODEL)
    if weight["size"] != SIZE or weight["lfs"]["sha256"] != DIGEST:
        raise ValueError("Pinned weight metadata mismatch")
    sources = []
    for name in (
        "README.md",
        "LICENSE",
        "tokenizer_config.json",
        "tokenizer.json",
        "config.json",
    ):
        entry = next(row for row in upstream["siblings"] if row["rfilename"] == name)
        path = FOLDER / name
        if not path.exists():
            path.write_bytes(
                read_url(
                    f"https://huggingface.co/{UPSTREAM}/resolve/{UPSTREAM_REVISION}/{name}"
                )
            )
        payload = path.read_bytes()
        digest = hashlib.sha256(payload).hexdigest()
        blob = hashlib.sha1(
            b"blob " + str(len(payload)).encode() + b"\0" + payload
        ).hexdigest()
        if (
            (digest != entry["lfs"]["sha256"])
            if "lfs" in entry
            else (blob != entry["blobId"])
        ):
            raise ValueError(f"Upstream file mismatch: {name}")
        sources.append({"file": name, "sha256": digest})
    template = json.loads(
        (FOLDER / "tokenizer_config.json").read_text(encoding="utf-8")
    )["chat_template"]
    if not isinstance(template, str):
        raise TypeError("Expected an official string chat template")
    (FOLDER / "chat_template.jinja").write_text(template, encoding="utf-8")
    scripts = ROOT / "scripts/natural-language"
    helper = load_module("qwen2507_fetch", scripts / "jev/fetch_model.py")
    hashing = load_module("qwen2507_hash", scripts / "instruct/fetch.py")
    helper.parallel_fetch(
        f"https://huggingface.co/{REPOSITORY}/resolve/{REVISION}/{MODEL}",
        FOLDER / MODEL,
        DIGEST,
        SIZE,
        hashing,
    )
    (FOLDER / "manifest.json").write_text(
        json.dumps(
            {
                "repository": REPOSITORY,
                "revision": REVISION,
                "upstream": UPSTREAM,
                "upstream_revision": UPSTREAM_REVISION,
                "file": MODEL,
                "sha256": DIGEST,
                "bytes": SIZE,
                "template_sha256": hashing.sha256(FOLDER / "chat_template.jinja"),
                "supporting": sources,
                "license": "Apache-2.0",
                "scope": "Published Q4_0 quantization; official non-thinking template; no project training; quality not inferred from model card",
            },
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
