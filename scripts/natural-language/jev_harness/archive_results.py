"""Archive evaluation evidence without copying weights, runtimes or environments."""

import shutil

from bridge import ARTIFACTS, HERE, ROOT, sha256, write_json


def main():
    destination = ROOT / "docs/research/natural-language-jev-harness/2026-10-18"
    destination.mkdir(parents=True, exist_ok=True)
    for name in (
        "dev-round1",
        "dev-round2",
        "dev-comparison",
        "category-sweep",
        "counterfactual",
        "oracle-diagnostic",
        "oracle-comparison",
        "probes",
        "probe-comparison",
        "regression",
        "regression-comparison",
        "regression-counterfactual",
    ):
        source = ARTIFACTS / name
        if not source.is_dir():
            raise FileNotFoundError(source)
        if name in (
            "dev-round1",
            "dev-round2",
            "oracle-diagnostic",
            "probes",
            "regression",
        ):
            for predictions in source.glob("*/predictions.jsonl"):
                if not (predictions.parent / "summary.json").is_file():
                    raise ValueError(f"Incomplete run: {predictions.parent}")
        shutil.copytree(source, destination / name, dirs_exist_ok=True)
    for path in ARTIFACTS.glob("*.json"):
        shutil.copy2(path, destination / path.name)
    shutil.copy2(HERE / "freeze.json", destination / "freeze.json")
    evidence = {
        str(path.relative_to(destination)).replace("\\", "/"): sha256(path)
        for path in destination.rglob("*")
        if path.is_file() and path.name not in ("report.md", "evidence-sha256.json")
    }
    write_json(destination / "evidence-sha256.json", evidence)
    print(f"Archived {len(evidence)} evidence files")


if __name__ == "__main__":
    main()
