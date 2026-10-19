"""Fetch a pinned published JevEmbed checkpoint, without training or remote code."""

import concurrent.futures
import hashlib
import importlib.util
import json
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ARTIFACTS = ROOT / "artifacts/natural-language-jev"
MODEL_ID = "HIT-TMG/JevEmbed-Qwen3-Embedding-0.6B"
REVISION = "e4a71aacd9b47ae6106fe57b7bf1c39992dc7ab1"


def parallel_fetch(url, path, expected, size, helper):
    if path.exists() and helper.sha256(path) == expected:
        return
    partial = path.with_suffix(path.suffix + ".part")
    offset = partial.stat().st_size if partial.exists() else 0
    if offset > size:
        raise ValueError("Partial download exceeds expected size")
    chunks = path.parent / (path.name + ".chunks")
    chunks.mkdir(exist_ok=True)
    jobs = [
        (start, min(start + 16 * 1024 * 1024, size))
        for start in range(offset, size, 16 * 1024 * 1024)
    ]

    def chunk(job):
        start, end = job
        target = chunks / f"{start}-{end}"
        if target.exists() and target.stat().st_size == end - start:
            return target
        for attempt in range(3):
            try:
                opener = (
                    urllib.request.build_opener(urllib.request.ProxyHandler({}))
                    if attempt != 1
                    else urllib.request.build_opener()
                )
                request = urllib.request.Request(
                    url, headers={"Range": f"bytes={start}-{end - 1}"}
                )
                with opener.open(request, timeout=60) as response:
                    if (
                        response.status != 206
                        or response.headers.get("Content-Range")
                        != f"bytes {start}-{end - 1}/{size}"
                    ):
                        raise ValueError("Unexpected ranged response")
                    payload = response.read()
                if len(payload) != end - start:
                    raise ValueError("Truncated chunk")
                target.write_bytes(payload)
                print(f"Downloaded range {start}-{end}/{size}", flush=True)
                return target
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        completed = list(pool.map(chunk, jobs))
    with partial.open("ab") as stream:
        for file in completed:
            stream.write(file.read_bytes())
    if helper.sha256(partial) != expected:
        raise ValueError("Checkpoint SHA256 mismatch")
    partial.replace(path)
    print(f"Verified {path.name}: {size} bytes", flush=True)


def main():
    spec = importlib.util.spec_from_file_location(
        "pinned_fetch", HERE.parent / "instruct/fetch.py"
    )
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    metadata_path = ARTIFACTS / "hf-metadata.json"
    if not metadata_path.exists():
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        url = f"https://huggingface.co/api/models/{MODEL_ID}/revision/{REVISION}?blobs=true"
        with opener.open(url, timeout=30) as response:
            metadata_path.write_bytes(response.read())
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if metadata["sha"] != REVISION:
        raise ValueError("Unexpected checkpoint revision")
    files = [
        row
        for row in metadata["siblings"]
        if not row["rfilename"].startswith(("lora/", "assets/", "."))
    ]
    target = ARTIFACTS / "checkpoint"

    def download(row):
        name = row["rfilename"]
        path = target / name
        if not path.resolve().is_relative_to(target.resolve()):
            raise ValueError("Checkpoint file escapes its target directory")
        url = f"https://huggingface.co/{MODEL_ID}/resolve/{REVISION}/{name}"
        path.parent.mkdir(parents=True, exist_ok=True)
        if "lfs" in row:
            downloader = parallel_fetch if row["size"] > 100_000_000 else None
            if downloader:
                downloader(url, path, row["lfs"]["sha256"], row["size"], helper)
            else:
                helper.fetch(url, path, row["lfs"]["sha256"], row["size"])
        else:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(url, timeout=30) as response:
                payload = response.read()
            digest = hashlib.sha1(
                b"blob " + str(len(payload)).encode() + b"\0" + payload
            ).hexdigest()
            if digest != row["blobId"]:
                raise ValueError(f"Git blob mismatch: {name}")
            path.write_bytes(payload)
        return {
            "name": name,
            "bytes": path.stat().st_size,
            "sha256": helper.sha256(path),
        }

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        manifest = list(pool.map(download, files))
    (ARTIFACTS / "checkpoint-manifest.json").write_text(
        json.dumps(
            {"model": MODEL_ID, "revision": REVISION, "files": manifest}, indent=2
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
