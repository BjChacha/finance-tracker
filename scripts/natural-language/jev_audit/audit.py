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
from encoder import ReferenceEncoder
from jevembed import JevEmbed, ModelConfig
from jevembed.backends.sentence_transformers import SentenceTransformersBackend
from revision import VariantParser


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
        "\u6211\u7684\u8f66\u5145\u7535\u82b1\u4e8630\u5757",
        "\u5348\u9910\u5403\u76d6\u996d\u82b118\u5143",
        "\u4e70\u5976\u8336\u82b1\u5341\u4e94\u5757\u516b",
        "\u6628\u5929\u7406\u53d1\u5e97\u526a\u5934\u53d1",
        "\u7eed\u8d39\u4e91\u76d8\u4f1a\u5458",
        "\u548c\u540c\u5b66\u805a\u9910",
        "\u4e70\u5236\u4f5c\u9676\u6ce5\u624b\u5de5",
        "\u6628\u5929\u4ece\u6211\u7684\u652f\u4ed8\u5b9d\u8f6c",
        "\u4eca\u5929\u62ff\u73b0\u91d1",
        "\u4ece\u6211\u7684\u94f6\u884c\u5361\u4ed837.25\u5143\u8fd8\u6e05\u4fe1\u7528\u5361\u8d26\u5355",
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
