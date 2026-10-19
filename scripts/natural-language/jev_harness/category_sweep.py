"""Development-only oracle-type diagnostics for category input design."""

import json
import re

from bridge import (
    ARTIFACTS,
    HERE,
    ROOT,
    DecisionParser,
    EmbeddingServer,
    PromptAdapter,
    PromptConfig,
    contract,
    evaluation,
    write_json,
)


def main():
    rows = [
        row
        for row in evaluation.load_rows(HERE.parent / "data/dev.tsv")
        if row["status"] == "single"
    ]
    output = ARTIFACTS / "category-sweep"
    output.mkdir(parents=True, exist_ok=False)
    modes = (
        "original",
        "plain_names",
        "plain_examples",
        "compact",
        "focused",
        "response",
    )
    records = []
    with EmbeddingServer(
        ROOT / "artifacts/natural-language-jev/models/jev-qwen3-0.6b-q8_0.gguf", 18474
    ) as server:
        parsers = {mode: DecisionParser(server.encoder) for mode in modes}
        for mode, parser in parsers.items():
            parser.prompt_config = PromptConfig(
                choice_candidate_template="{text}",
                query_template="{text}"
                if mode.startswith("plain")
                else "Instruct: {instruction}\nQuery: {text}",
            )
            parser.adapter = PromptAdapter(parser.prompt_config)
        with (output / "predictions.jsonl").open("w", encoding="utf-8") as stream:
            for row in rows:
                context = contract.context_for(row)
                results = {}
                for mode, parser in parsers.items():
                    query = row["text"]
                    if mode == "focused":
                        for span in reversed(contract.amount_candidates(query)):
                            query = query[: span["start"]] + query[span["end"] :]
                        names = [
                            name
                            for account in context["accounts"]
                            for name in [account["name"], *account.get("aliases", [])]
                        ]
                        for name in sorted(names, key=len, reverse=True):
                            query = query.replace(name, "")
                        query = re.sub(
                            r"\u4eca\u5929|\u6628\u5929|\u524d\u5929|\u6628\u665a",
                            "",
                            query,
                        )
                    criteria = {}
                    for category in context["categories"]:
                        if category["type"] != row["type"]:
                            continue
                        name = category["name"]
                        examples = "; ".join(category.get("examples", []))
                        if mode == "original":
                            description = parser.prompts["category_template"].format(
                                name=name, parent="", examples=examples
                            )
                        elif mode == "plain_names":
                            description = name
                        elif mode == "response":
                            description = f"\u8fd9\u7b14\u4ea4\u6613\u5c5e\u4e8e{name}\u5206\u7c7b\uff1a{examples}"
                        else:
                            description = name + ": " + examples
                        criteria[category["id"]] = description
                    criteria["unknown"] = parser.prompts["category_unknown"]
                    instruction = (
                        parser.prompts["category_instruction"]
                        if mode == "original"
                        else "\u5224\u65ad\u8fd9\u7b14\u4ea4\u6613\u7684\u5206\u7c7b\u3002"
                    )
                    results[mode] = parser.choices(
                        query, {"category": parser.question(instruction, criteria)}
                    )["category"]
                record = {"expected": row, "answers": results}
                records.append(record)
                stream.write(json.dumps(record, ensure_ascii=False) + "\n")
                stream.flush()
                if len(records) % 10 == 0:
                    print(f"Category sweep {len(records)}/{len(rows)}", flush=True)
    summary = {
        mode: sum(
            r["answers"][mode]["choice"] == r["expected"]["category"] for r in records
        )
        for mode in modes
    }
    write_json(
        output / "summary.json",
        {
            "oracle_type": True,
            "count": len(rows),
            "correct": summary,
            "note": "Development diagnostic; not deployable accuracy. Same Q8 weights, desktop CPU.",
        },
    )
    print(json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
