"""Separate input-contract failures from multilingual model limitations."""

import argparse
import json
import time

from evaluate import ARTIFACTS, HERE, TASKS, write_json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--splitter", choices=("char", "whitespace"), required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    import torch
    from gliner2 import AutoExtractor

    torch.set_num_threads(4)
    model = AutoExtractor.from_pretrained(
        str(ARTIFACTS / "GLiNER2.5-multi-Decide"),
        local_files_only=True,
        word_splitter=args.splitter,
        attention_backend="standard",
    ).eval()
    definition = TASKS["type"]
    labels = {value[0]: value[1] for value in definition["labels"].values()}
    configs = {
        "english_short": {"transaction_type": ["expense", "income", "transfer"]},
        "chinese_short": {definition["task"]: list(labels)[:3]},
        "chinese_descriptions": {definition["task"]: labels},
        "chinese_prompt_descriptions": {
            definition["task"]: {"labels": labels, "prompt": definition["prompt"]}
        },
    }
    records = []
    with torch.inference_mode():
        for probe in json.loads((HERE / "probes.json").read_text(encoding="utf-8")):
            for name, config in configs.items():
                start = time.perf_counter()
                raw = model.classify_text(
                    probe["text"], config, include_confidence=True
                )
                record = {
                    **probe,
                    "variant": name,
                    "tasks": config,
                    "raw": raw,
                    "elapsed_ms": (time.perf_counter() - start) * 1000,
                }
                records.append(record)
                print(len(records), name, raw, flush=True)
        records.append(
            {
                "official_sentiment_sanity": model.classify_text(
                    "This product exceeded my expectations! Absolutely love it.",
                    {"sentiment": ["positive", "negative", "neutral"]},
                    include_confidence=True,
                )
            }
        )
    write_json(ARTIFACTS / args.output, records)


if __name__ == "__main__":
    main()
