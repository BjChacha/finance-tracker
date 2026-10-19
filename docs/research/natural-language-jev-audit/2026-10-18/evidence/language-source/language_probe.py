"""Development-only instruction-language ablation, preserving Chinese candidates."""

import json
import sys
from copy import deepcopy
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "jev_harness"))
from bridge import (
    DecisionParser,
    EmbeddingServer,
    analyze,
    contract,
    evaluation,
    sha256,
    write_json,
)
from revision import VariantParser


def main():
    output = ROOT / "artifacts/natural-language-jev-audit/language-dev"
    output.mkdir(parents=True, exist_ok=False)
    data = HERE.parent / "distribution_v1/data/dev.tsv"
    rows = evaluation.load_rows(data)
    translated = json.loads(
        (HERE / "english-instructions.json").read_text(encoding="utf-8")
    )
    original = DecisionParser.choices
    requests = []

    def choose(parser, text, questions):
        questions = deepcopy(questions)
        if parser.language == "english":
            for field, question in questions.items():
                question["instructions"] = translated[field]
        requests.append({"text": text, "questions": questions})
        return original(parser, text, questions)

    write_json(
        output / "manifest.json",
        {
            "data_sha256": sha256(data),
            "script_sha256": sha256(Path(__file__)),
            "translations_sha256": sha256(HERE / "english-instructions.json"),
            "model": "JevEmbed 0.6B Q8_0, desktop CPU4, original frozen category_only candidate design",
            "scope": "Development-only instruction language comparison; Chinese text and candidates unchanged; no tuning or training",
        },
    )
    DecisionParser.choices = choose
    try:
        with EmbeddingServer(
            ROOT / "artifacts/natural-language-jev/models/jev-qwen3-0.6b-q8_0.gguf",
            18474,
        ) as server:
            for language in ("chinese", "english"):
                folder = output / language
                folder.mkdir()
                parser = VariantParser(server.encoder, "category_only")
                parser.language = language
                records = []
                with (folder / "predictions.jsonl").open(
                    "w", encoding="utf-8"
                ) as stream:
                    for row in rows:
                        requests.clear()
                        actual = parser.parse(row["text"], contract.context_for(row))
                        records.append(
                            {
                                "expected": row,
                                "actual": actual,
                                "requests": list(requests),
                            }
                        )
                        stream.write(json.dumps(records[-1], ensure_ascii=False) + "\n")
                        stream.flush()
                        if len(records) % 20 == 0:
                            print(language, len(records), flush=True)
                write_json(folder / "summary.json", evaluation.summarize(records))
                analyze(records, folder)
    finally:
        DecisionParser.choices = original


if __name__ == "__main__":
    main()
