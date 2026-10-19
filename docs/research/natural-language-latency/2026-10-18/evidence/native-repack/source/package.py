"""Package the experimental host runtime with unchanged, same-commit DSP skels."""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from backend import ARTIFACTS, sha256, write_json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="snapdragon-repack-b11669")
    args = parser.parse_args()
    source = ARTIFACTS / "llama.cpp"
    build = source / "build-repack/bin"
    original = ARTIFACTS / "snapdragon-b11669/llama-b11669/lib"
    if Path(args.output).name != args.output:
        raise ValueError("Expected a single output directory name")
    target = ARTIFACTS / args.output
    target.mkdir(exist_ok=False)
    (target / "lib").mkdir()
    (target / "bin").mkdir()
    records = []
    for file in [*build.glob("*.so"), *original.glob("libggml-htp-*.so")]:
        destination = target / "lib" / file.name
        shutil.copyfile(file, destination)
        records.append(
            {
                "path": destination.relative_to(target).as_posix(),
                "source": file.as_posix(),
                "sha256": sha256(destination),
                "bytes": destination.stat().st_size,
            }
        )
    for name in ("llama-server", "repack-roundtrip"):
        destination = target / "bin" / name
        shutil.copyfile(build / name, destination)
        records.append(
            {
                "path": destination.relative_to(target).as_posix(),
                "source": (build / name).as_posix(),
                "sha256": sha256(destination),
                "bytes": destination.stat().st_size,
            }
        )
    patch = subprocess.check_output(
        [
            "git",
            "-C",
            str(source),
            "diff",
            "--",
            "ggml/src/ggml-hexagon/ggml-hexagon.cpp",
        ]
    )
    (HERE / "parallel-q4_0.patch").write_bytes(patch)
    write_json(
        target / "manifest.json",
        {
            "source_commit": subprocess.check_output(
                ["git", "-C", str(source), "rev-parse", "HEAD"], text=True
            ).strip(),
            "patch_sha256": sha256(HERE / "parallel-q4_0.patch"),
            "toolchain": "ghcr.io/snapdragon-toolchain/arm64-android@sha256:c012b8174f4154088ee027077e9cb80e68cc9a494d46f63454a050fa4789897b",
            "dsp_skels": "Unchanged official b11669 binaries; all host libraries rebuilt together",
            "files": records,
        },
    )
    print("Packaged", len(records), "files", flush=True)


if __name__ == "__main__":
    main()
