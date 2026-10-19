"""Evaluate local schema-conditioned classification against the frozen contract."""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ARTIFACTS = ROOT / "artifacts/natural-language-latency/gliner"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
sys.path.insert(0, str(ARTIFACTS / "source"))
sys.path.insert(0, str(HERE.parent / "jev_harness"))
from bridge import contract, evaluation, sha256, write_json

TASKS = json.loads((HERE / "tasks.json").read_text(encoding="utf-8"))


def tasks_for(text, context, plain=False):
    context = contract.active_context(context)
    tasks, mapping = {}, {}
    unknown, unknown_desc = TASKS["unknown"]
    for field in (
        "status",
        "type",
        "day",
        "category",
        "amount",
        "account",
        "to_account",
    ):
        definition = TASKS[field]
        candidates = definition.get("labels")
        if field == "category":
            candidates = {
                row["id"]: [
                    TASKS["type_names"][row["type"]] + ":" + row["name"],
                    "; ".join([row["name"], *row.get("examples", [])]),
                ]
                for row in context["categories"]
            }
        elif field == "amount":
            candidates = {
                row["id"]: [row["text"] + " (" + row["id"] + ")", row["text"]]
                for row in contract.amount_candidates(text)
            }
        elif field in ("account", "to_account"):
            candidates = {
                row["id"]: [
                    row["name"],
                    "; ".join([row["name"], *row.get("aliases", [])]),
                ]
                for row in contract.mentioned_accounts(text, context)
            }
        candidates = dict(candidates)
        if plain and field == "type":
            candidates.pop("unknown", None)
        if field not in ("status", "type", "day"):
            candidates["unknown"] = [unknown, unknown_desc]
        labels = {value[0]: value[1] for value in candidates.values()}
        if len(labels) != len(candidates):
            raise ValueError("Candidate labels must be unique")
        tasks[definition["task"]] = {"labels": labels, "prompt": definition["prompt"]}
        if plain:
            tasks[definition["task"]] = list(labels)
        mapping[field] = {value[0]: key for key, value in candidates.items()}
    return tasks, mapping


def parse(model, text, context, plain=False):
    start = time.perf_counter()
    tasks, mapping = tasks_for(text, context, plain)
    raw = model.classify_text(text, tasks, include_confidence=True)
    decision = {
        field: mapping[field][raw[TASKS[field]["task"]]["label"]] for field in mapping
    }
    decision["status"] = "single" if decision["status"] == "single" else "clarify"
    for field in ("type", "amount", "category", "account", "to_account"):
        if decision[field] == "unknown":
            decision[field] = None
    # Destination is not an applicable field for expense or income.
    if decision["type"] != "transfer":
        decision["to_account"] = None
    decision = contract.parse_structure(
        json.dumps(decision), contract.schema_for(text, context)
    )
    return {
        "schema_valid": True,
        "decision": decision,
        "validated": contract.validate_business(decision, text, context),
        "raw": raw,
        "tasks": tasks,
        "elapsed_ms": (time.perf_counter() - start) * 1000,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="GLiNER2.5-multi-Decide")
    parser.add_argument("--splitter", choices=("char", "whitespace"), default="char")
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--stride", type=int, default=1)
    parser.add_argument("--output", required=True)
    parser.add_argument("--plain", action="store_true")
    args = parser.parse_args()
    import torch
    from gliner2 import AutoExtractor

    torch.set_num_threads(4)
    torch.manual_seed(42)
    output = ARTIFACTS / args.output
    output.mkdir(parents=True, exist_ok=False)
    snapshot = output / "source"
    snapshot.mkdir()
    for name in ("evaluate.py", "tasks.json"):
        (snapshot / name).write_bytes((HERE / name).read_bytes())
    manifest = {
        "model": args.model,
        "word_splitter": args.splitter,
        "plain": args.plain,
        "data_sha256": sha256(args.data),
        "scope": "Desktop CPU FP32, offline inference, no project fine-tuning",
        "source_revision": subprocess.check_output(
            ["git", "-C", str(ARTIFACTS / "source"), "rev-parse", "HEAD"], text=True
        ).strip(),
        "checkpoint": json.loads(
            (ARTIFACTS / args.model / "download-manifest.json").read_text(
                encoding="utf-8"
            )
        ),
    }
    start = time.perf_counter()
    model = AutoExtractor.from_pretrained(
        str(ARTIFACTS / args.model),
        local_files_only=True,
        word_splitter=args.splitter,
        attention_backend="standard",
    )
    model.eval()
    manifest["load_ms"] = (time.perf_counter() - start) * 1000
    manifest["class"] = type(model).__name__
    manifest["dtype"] = str(next(model.parameters()).dtype)
    write_json(output / "manifest.json", manifest)
    rows = evaluation.load_rows(args.data)[:: args.stride]
    if args.limit:
        rows = rows[: args.limit]
    records = []
    with (
        torch.inference_mode(),
        (output / "predictions.jsonl").open("w", encoding="utf-8") as stream,
    ):
        for index, row in enumerate(rows):
            actual = parse(model, row["text"], contract.context_for(row), args.plain)
            record = {"expected": row, "actual": actual}
            records.append(record)
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")
            stream.flush()
            print(
                index + 1,
                row["id"],
                actual["decision"],
                actual["elapsed_ms"],
                flush=True,
            )
    write_json(output / "summary.json", evaluation.summarize(records))


if __name__ == "__main__":
    main()
