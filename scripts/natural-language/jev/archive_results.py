"""Copy reproducible experiment evidence into the reviewable research directory."""

import shutil

from support import ARTIFACTS, HERE, ROOT, sha256, write_json


def main():
    destination = ROOT / "docs/research/natural-language-jev/2026-10-18"
    destination.mkdir(parents=True, exist_ok=True)
    experiments = {
        "dev-reference-v1": ("summary.json", "predictions.jsonl"),
        "dev-reference-v2": ("summary.json", "predictions.jsonl"),
        "dev-q4-v1": ("summary.json", "predictions.jsonl"),
        "dev-q8-v2": ("summary.json", "predictions.jsonl"),
        "dev-q8-v3": ("summary.json", "predictions.jsonl"),
        "parity-f16": ("summary.json", "vectors.json"),
        "parity-q4": ("summary.json", "vectors.json"),
        "parity-android-q4": ("summary.json", "vectors.json"),
        "parity-android-q8": ("summary.json", "vectors.json"),
    }
    for name in (
        "comparison-reference",
        "comparison-android-q4",
        "comparison-android-q8",
    ):
        experiments[name] = (
            "summary.json",
            "manifest.json",
            "predictions.jsonl",
            "failures.tsv",
            "diagnostics.json",
        )
    for name in ("device-q4", "device-q8", "device-q4-cool"):
        experiments[name] = (
            "summary.json",
            "measurements.jsonl",
            "pss-samples.json",
            "document-cache.json",
            "trace-analysis.json",
            "trace-status.json",
        )
    sources = [
        (ARTIFACTS / "reports" / name / file, destination / name / file)
        for name, files in experiments.items()
        for file in files
    ]
    sources += [
        (ARTIFACTS / file, destination / file)
        for file in (
            "checkpoint-manifest.json",
            "all-models.json",
            "requirements-reference.txt",
        )
    ]
    sources += [
        (
            ARTIFACTS / "reports/paired-comparison.json",
            destination / "paired-comparison.json",
        ),
        (HERE / "freeze.json", destination / "freeze.json"),
        (ARTIFACTS / "source/LICENSE", destination / "JevEmbed-LICENSE.txt"),
        (ARTIFACTS / "llama-source/LICENSE", destination / "llama-LICENSE.txt"),
        (ARTIFACTS / "checkpoint/README.md", destination / "MODEL-CARD.md"),
        (ARTIFACTS / "checkpoint/jevembed.yaml", destination / "jevembed.yaml"),
    ]
    for source, _ in sources:
        if not source.is_file():
            raise FileNotFoundError(source)
    hashes = {}
    for source, target in sources:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        hashes[str(target.relative_to(destination)).replace("\\", "/")] = sha256(target)
    for name in ("device-q4", "device-q8", "device-q4-cool"):
        trace = ARTIFACTS / "reports" / name / "warm-trace.pb"
        hashes[f"local-artifact:{name}/warm-trace.pb"] = sha256(trace)
    write_json(destination / "evidence-sha256.json", hashes)


if __name__ == "__main__":
    main()
