"""Tune only on dev, freeze, then evaluate both precisions on held-out data."""

import argparse
import platform
import re
import time

import numpy as np
from common import ARTIFACTS, HERE, MODELS, digest, read_json, write_json
from corpus import load_split, validate_corpus
from metrics import release_gate, summarize
from money import parse_money
from runtime import OfflineCandidate, amount_from, decode_spans, type_from


def fit():
    candidate = OfflineCandidate()
    corpus = validate_corpus()
    dev = [row for row in load_split("dev") if row["status"] == "single"]
    selected, trials = {}, {}
    for field in ("amount", "type"):
        records = []
        for prompt in candidate.prompts[field]:
            cached = [(row, candidate.raw(prompt, row["text"])) for row in dev]
            for threshold in candidate.prompts["thresholds"]:
                correct = 0
                for row, (encoded, starts, ends) in cached:
                    spans = decode_spans(
                        encoded, starts, ends, prompt, row["text"], threshold
                    )
                    value = (
                        amount_from(spans)
                        if field == "amount"
                        else type_from(spans, candidate.prompts["type_labels"])
                    )
                    correct += (
                        value == row["amount_cents" if field == "amount" else "type"]
                    )
                records.append(
                    {
                        "prompt": prompt,
                        "threshold": threshold,
                        "correct": correct,
                        "total": len(dev),
                    }
                )
        records.sort(
            key=lambda row: (-row["correct"], -row["threshold"], row["prompt"])
        )
        selected[field] = {key: records[0][key] for key in ("prompt", "threshold")}
        trials[field] = records
    selected["corpus_hashes"] = corpus["hashes"]
    selected["context_hash"] = digest(HERE / "data" / "context.json")
    selected["prompts_hash"] = digest(HERE / "data" / "prompts.json")
    selected["export_manifest_hash"] = digest(ARTIFACTS / "export-manifest.json")
    write_json(ARTIFACTS / "frozen-config.json", selected)
    write_json(ARTIFACTS / "dev-trials.json", trials)
    print(selected, flush=True)


def rules_baseline(text, context):
    spans = re.findall(r"[0-9]+(?:\.[0-9]+)?", text)
    amount = parse_money(spans[0]) if len(spans) == 1 else None
    income = re.search(r"\u6536\u5230|\u6536\u5165|\u5230\u8d26", text)
    transaction_type = (
        "transfer" if "\u8f6c" in text else "income" if income else "expense"
    )
    names = [
        row["id"]
        for row in context["categories"]
        if row["type"] == transaction_type and row["name"] in text
    ]
    category = names[0] if len(names) == 1 else None
    return {
        "amount_cents": amount,
        "type": transaction_type,
        "category": category,
        "status": "single" if amount else "clarify",
        "unresolved": [
            key
            for key, value in (("amount", amount), ("category", category))
            if value is None
        ],
    }


def evaluate(split):
    corpus = validate_corpus()
    config = read_json(ARTIFACTS / "frozen-config.json")
    if (
        config["corpus_hashes"] != corpus["hashes"]
        or config["context_hash"] != digest(HERE / "data" / "context.json")
        or config["prompts_hash"] != digest(HERE / "data" / "prompts.json")
        or config["export_manifest_hash"] != digest(ARTIFACTS / "export-manifest.json")
    ):
        raise ValueError("Frozen inputs changed; use a new evaluation revision")
    summaries, all_rows = {}, {}
    for precision in ("fp32", "int8", "rules_baseline"):
        started = time.perf_counter()
        candidate = (
            OfflineCandidate(precision) if precision != "rules_baseline" else None
        )
        load_ms = (time.perf_counter() - started) * 1000
        rows, timings = [], []
        for expected in load_split(split):
            started = time.perf_counter()
            prediction = (
                candidate.parse(expected["text"], config)
                if candidate
                else rules_baseline(
                    expected["text"], read_json(HERE / "data" / "context.json")
                )
            )
            timings.append((time.perf_counter() - started) * 1000)
            rows.append(
                {
                    "id": expected["id"],
                    "text": expected["text"],
                    "group": expected["group"],
                    "expected": {
                        key: expected[key]
                        for key in ("amount_cents", "type", "category", "status")
                    },
                    "prediction": prediction,
                }
            )
        metrics = summarize(rows)
        summaries[precision] = {
            "metrics": metrics,
            "desktop_cpu_timing": {
                "load_ms_single_observation": load_ms,
                "parse_p50_ms": float(np.percentile(timings, 50)),
                "parse_p95_ms": float(np.percentile(timings, 95)),
                "sample_count": len(timings),
                "threads": 4,
                "includes": "5 sequential UIE prompts, query embedding, ranking and integer normalization; category cache preloaded",
                "not_mobile_evidence": True,
            },
        }
        all_rows[precision] = rows
        print(precision, metrics, flush=True)
    resource_paths = [
        *MODELS.glob("*.int8.onnx"),
        *[
            file
            for folder in MODELS.glob("*-tokenizer")
            for file in folder.rglob("*")
            if file.is_file()
        ],
        MODELS / "bge-model-card.md",
        MODELS / "uie-license.txt",
        MODELS / "bge-license.txt",
    ]
    resource_bytes = sum(path.stat().st_size for path in resource_paths)
    disagreements = {
        field: sum(
            a["prediction"].get(field) != b["prediction"].get(field)
            for a, b in zip(all_rows["fp32"], all_rows["int8"])
        )
        for field in ("amount_cents", "type", "category", "status")
    }
    report = {
        "split": split,
        "corpus": corpus,
        "frozen_config_sha256": digest(ARTIFACTS / "frozen-config.json"),
        "platform": platform.platform(),
        "results": summaries,
        "quantization_field_disagreements": disagreements,
        "resources_bytes_provisional": resource_bytes,
        "mobile": None,
        "release_gate": release_gate(
            summaries["int8"]["metrics"], resource_bytes=resource_bytes
        ),
        "limitations": [
            "Synthetic assistant-authored labels await independent human review.",
            "Mobile tokenizer, runtime, PSS, cold/warm p95 and first-install offline execution remain unverified.",
            "Level-one categories only; child categories, date parsing and production form integration are not implemented.",
            "Resource count includes ONNX weights, tokenizer assets, upstream notices and model card; excludes mobile runtime binary and final application manifest.",
        ],
    }
    output = ARTIFACTS / "reports" / split
    write_json(output / "summary.json", report)
    write_json(output / "predictions.json", all_rows)
    failures = [
        row
        for row in all_rows["int8"]
        if (
            row["expected"]["status"] == "single"
            and any(
                row["prediction"].get(key) != row["expected"][key]
                for key in ("amount_cents", "type", "category")
            )
        )
        or (
            row["expected"]["status"] == "clarify"
            and row["prediction"]["status"] == "single"
        )
    ]
    write_json(output / "failures.json", failures)
    print(f"Report: {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("fit", "evaluate"))
    parser.add_argument("--split", choices=("dev", "test"), default="test")
    args = parser.parse_args()
    fit() if args.command == "fit" else evaluate(args.split)
