"""Deploy and checksum an experimental runtime on an explicitly selected device."""

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from backend import ARTIFACTS, native, write_json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", required=True)
    parser.add_argument("--package", default="snapdragon-repack-b11669-v2")
    args = parser.parse_args()
    if not args.package.replace("-", "").isalnum():
        raise ValueError("Invalid package directory")
    native.SERIAL = args.serial
    folder = ARTIFACTS / args.package
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    remote = f"{native.REMOTE}/{args.package}"
    native.adb("push", str(folder), native.REMOTE + "/")
    for name in ("llama-server", "repack-roundtrip"):
        native.adb("shell", "chmod", "755", f"{remote}/bin/{name}")
    links = []
    for name in ("libggml-cpu.so", "libggml-hexagon.so", "libggml-opencl.so"):
        native.adb("shell", "ln", "-sf", f"../lib/{name}", f"{remote}/bin/{name}")
        links.append({"path": f"bin/{name}", "target": f"../lib/{name}"})
    checks = []
    for item in manifest["files"]:
        actual = native.adb(
            "shell", "sha256sum", f"{remote}/{item['path']}"
        ).stdout.split()[0]
        if actual != item["sha256"]:
            raise ValueError(f"Device checksum mismatch: {item['path']}")
        checks.append({"path": item["path"], "sha256": actual})
    write_json(
        folder / "deployment.json",
        {
            "serial": args.serial,
            "remote": remote,
            "backend_links": links,
            "files": checks,
        },
    )
    print("Verified", len(checks), "device files and backend search links", flush=True)


if __name__ == "__main__":
    main()
