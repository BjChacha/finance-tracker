"""Convert the verified merged checkpoint using a pinned upstream converter."""

import json
import subprocess
import sys

from support import ARTIFACTS, ROOT, sha256, write_json

LLAMA_REVISION = "620d2225cc436ab0b001e3200e590e3b286ef9ab"
JEV_REVISION = "d331c4b0f5a0f69b92d94b8f5b2f82853ac83277"


def main():
    for name, expected in (("llama-source", LLAMA_REVISION), ("source", JEV_REVISION)):
        actual = subprocess.check_output(
            ["git", "-C", str(ARTIFACTS / name), "rev-parse", "HEAD"], text=True
        ).strip()
        if actual != expected:
            raise ValueError(f"Unexpected source revision: {name}")
    checkpoint = ARTIFACTS / "checkpoint"
    manifest = json.loads(
        (ARTIFACTS / "checkpoint-manifest.json").read_text(encoding="utf-8")
    )
    for row in manifest["files"]:
        if sha256(checkpoint / row["name"]) != row["sha256"]:
            raise ValueError(f"Checkpoint hash mismatch: {row['name']}")
    models = ARTIFACTS / "models"
    models.mkdir(exist_ok=True)
    f16 = models / "jev-qwen3-0.6b-f16.gguf"
    q4 = models / "jev-qwen3-0.6b-q4_k_m.gguf"
    q8 = models / "jev-qwen3-0.6b-q8_0.gguf"
    commands = [
        [
            sys.executable,
            str(ARTIFACTS / "llama-source/convert_hf_to_gguf.py"),
            str(checkpoint),
            "--outtype",
            "f16",
            "--outfile",
            str(f16),
        ],
        [
            str(
                ROOT / "artifacts/natural-language-instruct/runtime/llama-quantize.exe"
            ),
            str(f16),
            str(q4),
            "Q4_K_M",
            "4",
        ],
    ]
    commands.append(
        [
            str(
                ROOT / "artifacts/natural-language-instruct/runtime/llama-quantize.exe"
            ),
            str(f16),
            str(q8),
            "Q8_0",
            "4",
        ]
    )
    for index, command in enumerate(commands):
        with (ARTIFACTS / f"convert-{index}.log").open("wb") as log:
            subprocess.run(command, check=True, stdout=log, stderr=log)
        print(f"Completed conversion stage {index + 1}", flush=True)
    write_json(
        ARTIFACTS / "model-manifest.json",
        {
            "checkpoint": manifest["model"],
            "checkpoint_revision": manifest["revision"],
            "llama_revision": LLAMA_REVISION,
            "jev_revision": JEV_REVISION,
            "commands": commands,
            "models": [
                {
                    "name": path.name,
                    "bytes": path.stat().st_size,
                    "sha256": sha256(path),
                }
                for path in (f16, q4, q8)
            ],
        },
    )


if __name__ == "__main__":
    main()
