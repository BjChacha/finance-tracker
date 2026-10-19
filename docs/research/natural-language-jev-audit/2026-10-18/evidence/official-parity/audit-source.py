"""Compare the frozen adapter against the official local FP32 client."""

import json
import os
import sys
from dataclasses import asdict, replace
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "jev_harness"))
from bridge import DecisionParser, contract, evaluation, sha256, write_json
from revision import VariantParser
from encoder import ReferenceEncoder
from jevembed import JevEmbed, ModelConfig
from jevembed.backends.sentence_transformers import SentenceTransformersBackend


def main():
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    import torch

    torch.set_num_threads(4)
    output = ROOT / "artifacts/natural-language-jev-audit/official-parity"
    output.mkdir(parents=True, exist_ok=False)
    source = ROOT / "artifacts/natural-language-jev/source"
    cfg = replace(
        ModelConfig.load(source / "configs/jevembed-qwen3-embedding-0.6b.yaml"),
        model_name_or_path=str(ROOT / "artifacts/natural-language-jev/checkpoint"),
        local_files_only=True,
        device="cpu",
        dtype="float32",
        batch_size=8,
        overflow_policy="error",
    )
    backend = SentenceTransformersBackend(config=cfg)
    backend.prepare()
    # Reuse loaded weights only; each path performs its own actual encoding.
    encoder = ReferenceEncoder.__new__(ReferenceEncoder)
    encoder.model = backend._model
    clients = {}
    original = DecisionParser.choices
    captured = []

    def compared(parser, text, questions):
        actual = original(parser, text, questions)
        key = json.dumps(asdict(parser.prompt_config), sort_keys=True)
        if key not in clients:
            local_cfg = replace(cfg, prompts=parser.prompt_config)
            local_backend = SentenceTransformersBackend(config=local_cfg)
            local_backend._model = backend._model
            local_backend.metadata = backend.metadata
            clients[key] = JevEmbed(backend=local_backend, config=local_cfg)
        request = {"state": text, "questions": questions}
        official = clients[key].evaluate_with_trace(request)
        answers = official["response"]["answers"]
        comparisons = {}
        for field, answer in answers.items():
            prior = actual[field]
            comparisons[field] = {
                "choice_equal": answer["choice"] == prior["choice"],
                "max_probability_difference": max(
                    abs(prob - prior["probabilities"][label])
                    for label, prob in answer["probabilities"].items()
                ),
            }
        trace = official["trace"]
        # Metadata is archived once; retain every rendered input and score.
        trace.pop("backend_metadata", None)
        trace.pop("batches", None)
        captured.append(
            {
                "request": request,
                "prompt_config": asdict(parser.prompt_config),
                "adapted": actual,
                "official": official,
                "comparisons": comparisons,
            }
        )
        return actual

    data = HERE.parent / "distribution_v1/data/regression.tsv"
    rows = evaluation.load_rows(data)
    needles = [
        "我的车充电花了30块",
        "午餐吃盖饭花18元",
        "买奶茶花十五块八",
        "昨天理发店剪头发",
        "续费云盘会员",
        "和同学聚餐",
        "买制作陶泥手工",
        "昨天从我的支付宝转",
        "今天拿现金",
        "从我的银行卡付37.25元还清信用卡账单",
    ]
    selected = []
    for needle in needles:
        matches = [row for row in rows if needle in row["text"]]
        if not matches:
            raise ValueError(f"Missing diagnostic sample: {needle}")
        selected.append(matches[0])
    write_json(
        output / "manifest.json",
        {
            "config": asdict(cfg),
            "backend": backend.metadata,
            "data_sha256": sha256(data),
            "script_sha256": sha256(Path(__file__)),
            "selection": "Previously observed failures; diagnostic, not an accuracy estimate",
            "shared": "Weights only; separate encoding calls, no fabricated vectors",
        },
    )
    DecisionParser.choices = compared
    all_comparisons = []
    try:
        with (output / "records.jsonl").open("w", encoding="utf-8") as stream:
            for variant in ("baseline", "category_only"):
                parser = VariantParser(encoder, variant)
                for row in selected:
                    captured.clear()
                    actual = parser.parse(row["text"], contract.context_for(row))
                    record = {
                        "variant": variant,
                        "expected": row,
                        "actual": actual,
                        "calls": list(captured),
                    }
                    stream.write(json.dumps(record, ensure_ascii=False) + "\n")
                    stream.flush()
                    for call in captured:
                        all_comparisons.extend(call["comparisons"].values())
                    print(f"{variant}: {row['id']}", flush=True)
    finally:
        DecisionParser.choices = original
    summary = {
        "samples_per_variant": len(selected),
        "questions": len(all_comparisons),
        "choice_equal": sum(row["choice_equal"] for row in all_comparisons),
        "max_probability_difference": max(
            row["max_probability_difference"] for row in all_comparisons
        ),
    }
    write_json(output / "summary.json", summary)
    print(json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
