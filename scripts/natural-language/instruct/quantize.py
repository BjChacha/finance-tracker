"""Reproduce calibration-only quantization without updating model parameters."""

import argparse
import csv
import json
import subprocess
from pathlib import Path

from fetch import ARTIFACTS, sha256
from harness import LEGACY, default_context, prompt_for

HERE = Path(__file__).resolve().parent


def run(arguments, log_name):
    with (ARTIFACTS / log_name).open("wb") as output:
        subprocess.run(arguments, stdout=output, stderr=output, check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--calibrate", action="store_true")
    args = parser.parse_args()
    source = ARTIFACTS / "models" / "LFM2.5-350M-F16.gguf"
    matrix = ARTIFACTS / "imatrix-dev.gguf"
    if args.calibrate:
        with (LEGACY / "data" / "dev.tsv").open(encoding="utf-8", newline="") as stream:
            rows = list(csv.DictReader(stream, delimiter="\t"))[::5]
        calibration = ARTIFACTS / "calibration-dev.txt"
        calibration.write_text(
            "\n".join(
                prompt_for(
                    row["text"], default_context(), False, HERE / "prompt-en.txt"
                )
                for row in rows
            ),
            encoding="utf-8",
        )
        run(
            [
                str(ARTIFACTS / "runtime" / "llama-imatrix.exe"),
                "-m",
                str(source),
                "-f",
                str(calibration),
                "-o",
                str(matrix),
                "--chunks",
                "20",
                "-c",
                "512",
                "-t",
                "4",
                "-tb",
                "4",
                "-ngl",
                "0",
            ],
            "imatrix-reproduction.log",
        )
    if not matrix.is_file():
        raise FileNotFoundError("Run with --calibrate first")
    target = ARTIFACTS / "models" / "LFM2.5-350M-Q2_K_S-emb4.gguf"
    if target.exists():
        raise FileExistsError("Refusing to overwrite an evaluated model")
    run(
        [
            str(ARTIFACTS / "runtime" / "llama-quantize.exe"),
            "--imatrix",
            str(matrix),
            "--token-embedding-type",
            "q4_K",
            str(source),
            str(target),
            "Q2_K_S",
            "4",
        ],
        "quantize-reproduction.log",
    )
    print(json.dumps({"bytes": target.stat().st_size, "sha256": sha256(target)}))


if __name__ == "__main__":
    main()
