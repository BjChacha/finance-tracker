"""Shared paths and integrity checks for the offline feasibility experiment."""

import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
ARTIFACTS = ROOT / "artifacts" / "natural-language"
SOURCES = ARTIFACTS / "sources"
MODELS = ARTIFACTS / "models"


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify_sources():
    for entry in read_json(HERE / "sources.json")["files"]:
        path = SOURCES / entry["path"]
        if not path.is_file() or digest(path) != entry["sha256"]:
            raise ValueError(
                f"Missing or altered source: {path}. Run download.py first."
            )
