"""Load the frozen JevEmbed adapter without changing earlier experiment files."""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "jev"))
from decision import DecisionParser
from device_benchmark import DeviceServer
from encoder import EmbeddingServer
from support import (
    PromptAdapter,
    PromptConfig,
    baseline_evaluate as evaluation,
    baseline_harness as contract,
    read_json,
    sha256,
    write_json,
)
from compare_results import analyze, load

ROOT = HERE.parents[2]
ARTIFACTS = ROOT / "artifacts/natural-language-jev-harness"

__all__ = [
    "HERE", "ROOT", "ARTIFACTS", "DecisionParser", "DeviceServer",
    "EmbeddingServer", "PromptAdapter", "PromptConfig", "evaluation", "contract",
    "read_json", "sha256", "write_json", "analyze", "load",
]
