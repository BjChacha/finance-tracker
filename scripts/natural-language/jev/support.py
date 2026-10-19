"""Reuse the frozen baseline's accounting contract and metrics without editing it."""

import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ARTIFACTS = ROOT / "artifacts/natural-language-jev"


def load_baseline(name, filename):
    spec = importlib.util.spec_from_file_location(
        name, HERE.parent / "instruct" / filename
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# The older UIE scripts also have evaluate.py; resolve pinned files explicitly.
baseline_fetch = load_baseline("fetch", "fetch.py")
baseline_harness = load_baseline("harness", "harness.py")
baseline_runner = load_baseline("runner", "runner.py")
baseline_evaluate = load_baseline("instruct_evaluate", "evaluate.py")
baseline_android = load_baseline("instruct_android", "android_benchmark.py")
read_json = baseline_harness.read_json
write_json = baseline_evaluate.write_json
sha256 = baseline_fetch.sha256

sys.path.insert(0, str(ARTIFACTS / "source/src"))
from jevembed.compiler import compile_request
from jevembed.config import PromptConfig, ScoringConfig
from jevembed.errors import BackendError
from jevembed.prompts import PromptAdapter
from jevembed.scoring import normalize_vectors, score_plan

__all__ = [
    "ARTIFACTS",
    "HERE",
    "ROOT",
    "BackendError",
    "PromptAdapter",
    "PromptConfig",
    "ScoringConfig",
    "baseline_android",
    "baseline_evaluate",
    "baseline_harness",
    "baseline_runner",
    "compile_request",
    "normalize_vectors",
    "read_json",
    "score_plan",
    "sha256",
    "write_json",
]
