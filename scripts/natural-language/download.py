"""Fetch pinned build-time resources; inference never imports this module."""

import argparse
import shutil
import urllib.request

from common import HERE, SOURCES, digest, read_json, verify_sources


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--direct", action="store_true", help="Ignore environment proxy settings"
    )
    args = parser.parse_args()
    opener = (
        urllib.request.build_opener(urllib.request.ProxyHandler({}))
        if args.direct
        else urllib.request.build_opener()
    )
    for entry in read_json(HERE / "sources.json")["files"]:
        target = SOURCES / entry["path"]
        if target.exists() and digest(target) == entry["sha256"]:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + ".part")
        try:
            with (
                opener.open(entry["url"], timeout=90) as response,
                temporary.open("wb") as output,
            ):
                shutil.copyfileobj(response, output)
            if digest(temporary) != entry["sha256"]:
                raise ValueError(f"Checksum mismatch: {entry['path']}")
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
        print(f"Fetched {entry['path']}", flush=True)
    verify_sources()
    print("All source checksums verified.")


if __name__ == "__main__":
    main()
