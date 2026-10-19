"""Fetch the public precompiled bundle, pinning its HTTP entity across all ranges."""

import concurrent.futures
import hashlib
import json
import time
import urllib.request
import zipfile

from get_qwen3_2507 import FOLDER


def main():
    metadata = json.loads(
        (FOLDER / "compiled-bundle-head.json").read_text(encoding="utf-8")
    )
    archive = FOLDER / "geniex-qairt-sm8750.zip"
    chunks = FOLDER / "compiled-chunks"
    chunks.mkdir(exist_ok=True)
    size = metadata["bytes"]
    jobs = [
        (start, min(start + 16 * 1024 * 1024, size))
        for start in range(0, size, 16 * 1024 * 1024)
    ]

    def fetch(pair):
        start, end = pair
        path = chunks / f"{start}-{end}"
        if path.exists() and path.stat().st_size == end - start:
            return path
        for attempt in range(3):
            try:
                request = urllib.request.Request(
                    metadata["url"],
                    headers={
                        "Range": f"bytes={start}-{end - 1}",
                        "If-Match": metadata["etag"],
                    },
                )
                with urllib.request.urlopen(request, timeout=60) as response:
                    if (
                        response.status != 206
                        or response.headers.get("Content-Range")
                        != f"bytes {start}-{end - 1}/{size}"
                        or response.headers.get("ETag") != metadata["etag"]
                    ):
                        raise ValueError("Bundle entity or range changed")
                    payload = response.read()
                if len(payload) != end - start:
                    raise ValueError("Truncated bundle range")
                path.write_bytes(payload)
                print(f"Bundle range {start}-{end}/{size}", flush=True)
                return path
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
        raise RuntimeError("Unreachable download state")

    if not archive.exists():
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            completed = list(pool.map(fetch, jobs))
        partial = archive.with_suffix(".part")
        with partial.open("wb") as stream:
            for path in completed:
                stream.write(path.read_bytes())
        if partial.stat().st_size != size:
            raise ValueError("Bundle archive size mismatch")
        partial.replace(archive)
    with archive.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    target = FOLDER / "compiled"
    target.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as reader:
        for entry in reader.infolist():
            destination = (target / entry.filename).resolve()
            if (
                not destination.is_relative_to(target.resolve())
                or (entry.external_attr >> 16) & 0o170000 == 0o120000
            ):
                raise ValueError("Unsafe archive entry")
        reader.extractall(target)
    files = []
    for path in sorted(target.rglob("*")):
        if path.is_file():
            with path.open("rb") as stream:
                file_hash = hashlib.file_digest(stream, "sha256").hexdigest()
            files.append(
                {
                    "file": path.relative_to(target).as_posix(),
                    "bytes": path.stat().st_size,
                    "sha256": file_hash,
                }
            )
    manifest = {
        **metadata,
        "archive_sha256": digest,
        "hash_scope": "Locally recorded SHA256, not an upstream published checksum; ranges pinned by HTTPS If-Match and ZIP CRC",
        "files": files,
        "uncompressed_bytes": sum(row["bytes"] for row in files),
        "source_model": "Qwen/Qwen3-4B-Instruct-2507",
        "exporter_release": "qualcomm/ai-hub-models v0.64.0",
        "precision": "w4a16",
        "project_training": False,
    }
    (FOLDER / "compiled-manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    print("Bundle ready", digest, manifest["uncompressed_bytes"], flush=True)


if __name__ == "__main__":
    main()
