"""Archive completed evaluation evidence without model weights or trace binaries."""

import json
import shutil

from runtime import ARTIFACTS, HERE, ROOT, sha256, write_json

DESTINATION = ROOT / "docs/research/natural-language-mobile-models/2026-10-18"
RUNS = (
    "tablet-jev-regression",
    "tablet-jev-guards",
    "tablet-qwen-regression",
    "tablet-qwen-guards",
    "tablet-branch-regression",
    "tablet-branch-guards",
    "tablet-jev-performance",
    "tablet-qwen-performance",
    "desktop-regression",
    "desktop-guards",
    "desktop-branch-regression",
    "desktop-branch-guards",
    "desktop-safe-guards",
    "desktop-diagnostic-probes",
    "tablet-diagnostic-probes",
)


def main():
    comparison = ARTIFACTS / "final-comparison.json"
    data = json.loads(comparison.read_text(encoding="utf-8"))
    for model in data["models"].values():
        if model["distribution"]["single_count"] != 200:
            raise ValueError("Main evaluation is incomplete")
        if model["guards"]["count"] != 40:
            raise ValueError("Guard evaluation is incomplete")
    sources = [comparison]
    for name in RUNS:
        folder = ARTIFACTS / name
        if not folder.is_dir():
            raise FileNotFoundError(folder)
        if not (folder / "summary.json").is_file():
            raise ValueError(f"Run has no completion summary: {name}")
        sources.extend(
            path
            for path in folder.rglob("*")
            if path.is_file() and path.suffix in {".json", ".jsonl", ".tsv", ".log"}
        )
    sources.extend(
        path
        for path in ARTIFACTS.iterdir()
        if path.is_file() and path.suffix in {".json", ".md", ".jinja"}
    )
    sources.extend(
        [
            ARTIFACTS / "upstream-LICENSE",
            ARTIFACTS / "desktop-source-original.py",
            HERE.parent / "data/context.json",
            HERE.parent / "instruct/harness.py",
            HERE.parent / "instruct/sources.json",
        ]
    )
    sources.extend(path for path in HERE.iterdir() if path.is_file())
    sources.extend((HERE.parent / "distribution_v1/data").glob("*.tsv"))
    manifest = {
        "files": {},
        "excluded": "GGUF weights, runtime binaries, raw Perfetto traces",
        "external_traces": {},
    }
    for name in ("tablet-jev-performance", "tablet-qwen-performance"):
        trace = ARTIFACTS / name / "warm-trace.pb"
        manifest["external_traces"][trace.relative_to(ROOT).as_posix()] = {
            "sha256": sha256(trace),
            "bytes": trace.stat().st_size,
        }
    for source in sorted(set(sources)):
        relative = source.relative_to(ROOT)
        target = DESTINATION / "evidence" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        digest = sha256(source)
        if sha256(target) != digest:
            raise ValueError(f"Archive mismatch: {source}")
        manifest["files"][relative.as_posix()] = {
            "archive": target.relative_to(DESTINATION).as_posix(),
            "sha256": digest,
            "bytes": target.stat().st_size,
        }
    write_json(DESTINATION / "evidence-manifest.json", manifest)
    print(json.dumps({"files": len(manifest["files"]), "path": str(DESTINATION)}))


if __name__ == "__main__":
    main()
