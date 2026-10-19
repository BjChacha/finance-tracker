"""Download pinned model/runtime files with verified resumable range requests."""

import argparse
import concurrent.futures
import hashlib
import json
import tarfile
import time
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ARTIFACTS = ROOT / "artifacts" / "natural-language-instruct"


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def fetch(url, path, expected, size=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and sha256(path) == expected:
        return
    partial = path.with_suffix(path.suffix + ".part")
    if path.exists():
        if partial.exists():
            raise ValueError(f"Both invalid target and partial exist: {path}")
        path.rename(partial)
    while size is None or not partial.exists() or partial.stat().st_size < size:
        start = partial.stat().st_size if partial.exists() else 0
        end = (
            min(start + 4 * 1024 * 1024, size) - 1
            if size
            else start + 4 * 1024 * 1024 - 1
        )
        for attempt in range(3):
            opener = (
                urllib.request.build_opener(urllib.request.ProxyHandler({}))
                if attempt != 1
                else urllib.request.build_opener()
            )
            try:
                request = urllib.request.Request(
                    url, headers={"Range": f"bytes={start}-{end}"}
                )
                with opener.open(request, timeout=30) as response:
                    if response.status != 206:
                        if start != 0:
                            raise ValueError("Server ignored resume range")
                        payload = response.read()
                        size = len(payload)
                    else:
                        header = response.headers["Content-Range"]
                        if not header.startswith(f"bytes {start}-"):
                            raise ValueError("Unexpected content range")
                        size = int(header.split("/")[-1])
                        expected_count = (
                            int(header.split("-")[1].split("/")[0]) - start + 1
                        )
                        payload = response.read()
                        if len(payload) != expected_count:
                            raise ValueError("Truncated range")
                with partial.open("ab") as output:
                    output.write(payload)
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(1)
        if partial.stat().st_size % (32 * 1024 * 1024) < 4 * 1024 * 1024:
            print(
                f"Downloading {path.name}: {partial.stat().st_size}/{size}", flush=True
            )
    if sha256(partial) != expected:
        raise ValueError(f"SHA256 mismatch: {partial}")
    partial.replace(path)
    print(f"Verified {path.name}: {size} bytes", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--android", action="store_true")
    args = parser.parse_args()
    manifest = json.loads((HERE / "sources.json").read_text(encoding="utf-8"))
    base = (
        "https://huggingface.co/LiquidAI/LFM2.5-350M-GGUF/resolve/"
        + manifest["revision"]
        + "/"
    )
    jobs = [
        (
            base + row["name"],
            ARTIFACTS / "models" / row["name"],
            row["sha256"],
            row["bytes"],
        )
        for row in manifest["files"]
    ]
    runtime = manifest["runtime"]
    platforms = ["windows", "android"] if args.android else ["windows"]
    for platform in platforms:
        entry = runtime[platform]
        jobs.append(
            (
                f"https://github.com/ggml-org/llama.cpp/releases/download/{runtime['release']}/{entry['name']}",
                ARTIFACTS / entry["name"],
                entry["sha256"],
                None,
            )
        )
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(lambda job: fetch(*job), jobs))
    with zipfile.ZipFile(ARTIFACTS / runtime["windows"]["name"]) as archive:
        archive.extractall(ARTIFACTS / "runtime")
    if args.android:
        with tarfile.open(ARTIFACTS / runtime["android"]["name"]) as archive:
            archive.extractall(ARTIFACTS / "android-runtime", filter="data")


if __name__ == "__main__":
    main()
