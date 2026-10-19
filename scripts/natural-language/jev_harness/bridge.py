"""Load the frozen JevEmbed adapter without changing earlier experiment files."""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "jev"))
from compare_results import analyze, load
from decision import DecisionParser
from device_benchmark import DeviceServer
from encoder import EmbeddingServer
from support import (
    PromptAdapter,
    PromptConfig,
    read_json,
    sha256,
    write_json,
)
from support import (
    baseline_evaluate as evaluation,
)
from support import (
    baseline_harness as contract,
)

ROOT = HERE.parents[2]
ARTIFACTS = ROOT / "artifacts/natural-language-jev-harness"

__all__ = [
    "ARTIFACTS",
    "HERE",
    "ROOT",
    "DecisionParser",
    "DeviceServer",
    "EmbeddingServer",
    "PromptAdapter",
    "PromptConfig",
    "analyze",
    "contract",
    "evaluation",
    "load",
    "read_json",
    "sha256",
    "write_json",
]
