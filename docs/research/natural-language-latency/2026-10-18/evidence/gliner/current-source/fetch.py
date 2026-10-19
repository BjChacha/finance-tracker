"""Download a pinned public multilingual checkpoint, with content verification."""

import argparse
import hashlib
import importlib.util
import json
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ARTIFACTS = ROOT / "artifacts/natural-language-latency/gliner"
REVISIONS = {
    "GLiNER2.5-multi-Decide": "e173bca1f0c4217d7a55b3b0c705d5ece8a0218d",
    "gliner2.5-multi-v1": "cf5593a5d45e3bbf204b9df621b13b1c0cf25ee3",
}


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=REVISIONS, default="GLiNER2.5-multi-Decide")
    args = parser.parse_args()
    metadata = json.loads(
        (ARTIFACTS / f"fastino--{args.model}-metadata.json").read_text(encoding="utf-8")
    )
    revision = REVISIONS[args.model]
    if metadata["sha"] != revision:
        raise ValueError("Unexpected model revision")
    helper = load_module("fetch_helper", HERE.parent / "instruct/fetch.py")
    parallel = load_module("parallel_helper", HERE.parent / "jev/fetch_model.py")
    target = ARTIFACTS / args.model
    manifest = []
    for row in metadata["siblings"]:
        name = row["rfilename"]
        if name.startswith(".") or name.endswith((".png", ".jpg", "SKILL.md")):
            continue
        path = target / name
        if not path.resolve().is_relative_to(target.resolve()):
            raise ValueError("File escapes checkpoint directory")
        path.parent.mkdir(parents=True, exist_ok=True)
        url = f"https://huggingface.co/fastino/{args.model}/resolve/{revision}/{name}"
        if "lfs" in row:
            parallel.parallel_fetch(
                url, path, row["lfs"]["sha256"], row["size"], helper
            )
        else:
            with urllib.request.urlopen(url, timeout=60) as response:
                payload = response.read()
            digest = hashlib.sha1(
                b"blob " + str(len(payload)).encode() + b"\0" + payload
            ).hexdigest()
            if digest != row["blobId"]:
                raise ValueError(f"Git blob mismatch: {name}")
            path.write_bytes(payload)
        manifest.append(
            {"name": name, "bytes": path.stat().st_size, "sha256": helper.sha256(path)}
        )
    (target / "download-manifest.json").write_text(
        json.dumps(
            {
                "repository": f"fastino/{args.model}",
                "revision": revision,
                "files": manifest,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
