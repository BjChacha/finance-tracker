"""JevEmbed choice tasks followed by the existing deterministic accounting boundary."""

import json
import time

from support import (
    HERE,
    PromptAdapter,
    PromptConfig,
    ScoringConfig,
    compile_request,
    normalize_vectors,
    read_json,
    score_plan,
)
from support import (
    baseline_harness as contract,
)


class DecisionParser:
    def __init__(self, encoder, prompts=None):
        self.encoder = encoder
        self.prompts = prompts or read_json(HERE / "prompts.json")
        self.prompt_config = PromptConfig()
        self.adapter = PromptAdapter(self.prompt_config)
        self.scoring = ScoringConfig()
        self.document_cache = {}
        self.encoded_texts = []

    def choices(self, text, questions):
        request = {"state": text, "questions": questions}
        plans = compile_request(request, self.prompt_config)
        pending = {}
        vectors = dict(self.document_cache)
        for plan in plans:
            for item in plan.inputs:
                rendered = self.adapter.render(item)
                key = (item.role, rendered)
                if key not in vectors:
                    pending[key] = rendered
        if pending:
            texts = list(pending.values())
            self.encoded_texts.extend(texts)
            embedded = normalize_vectors(self.encoder.encode(texts), len(texts), 1024)
            for key, vector in zip(pending, embedded):
                vectors[key] = vector
                if key[0] == "document":
                    self.document_cache[key] = vector
        while len(self.document_cache) > 4096:
            self.document_cache.pop(next(iter(self.document_cache)))
        answers = {}
        for plan in plans:
            selected = [
                vectors[(item.role, self.adapter.render(item))] for item in plan.inputs
            ]
            answer, diagnostics = score_plan(plan, selected, self.scoring)
            answers[plan.question_id] = {**answer, **diagnostics}
        return answers

    @staticmethod
    def question(instruction, criteria):
        return {"type": "choice", "instructions": instruction, "criteria": criteria}

    def parse(self, text, context):
        if not text.strip() or len(text) > 200:
            raise ValueError("Expected 1 to 200 characters")
        started = time.perf_counter()
        self.encoded_texts = []
        context = contract.active_context(context)
        p = self.prompts
        questions = {
            field: self.question(p[field]["instruction"], p[field]["criteria"])
            for field in ("status", "type", "day")
        }
        candidates = contract.amount_candidates(text)
        amounts = {
            row["id"]: p["amount_template"].format(
                amount=row["text"],
                evidence=text[
                    max(0, row["start"] - 6) : min(len(text), row["end"] + 6)
                ],
            )
            for row in candidates
        }
        amounts["unknown"] = p["amount_unknown"]
        questions["amount"] = self.question(p["amount_instruction"], amounts)
        answers = self.choices(text, questions)
        kind = answers["type"]["choice"]
        kind = None if kind == "unknown" else kind
        accounts = contract.mentioned_accounts(text, context)
        questions = {}
        categories = {row["id"]: row for row in context["categories"]}
        criteria = {}
        for row in categories.values():
            if row["type"] != kind:
                continue
            parent = categories.get(row.get("parentId"), {})
            criteria[row["id"]] = p["category_template"].format(
                name=row["name"],
                parent=parent.get("name", ""),
                examples="; ".join(row.get("examples", [])),
            )
        if criteria:
            criteria["unknown"] = p["category_unknown"]
            questions["category"] = self.question(p["category_instruction"], criteria)
        for field, instruction, template in (
            (
                "account",
                "account_instruction",
                "income_template" if kind == "income" else "source_template",
            ),
            ("to_account", "destination_instruction", "destination_template"),
        ):
            if not accounts or (field == "to_account" and kind != "transfer"):
                continue
            criteria = {
                row["id"]: p[template].format(name=row["name"]) for row in accounts
            }
            criteria["unknown"] = p["account_unknown"]
            questions[field] = self.question(p[instruction], criteria)
        if questions:
            answers.update(self.choices(text, questions))
        decision = {
            "status": "single"
            if answers["status"]["choice"] == "single"
            else "clarify",
            "type": kind,
            "day": answers["day"]["choice"],
        }
        for field in ("amount", "category", "account", "to_account"):
            value = answers.get(field, {}).get("choice", "unknown")
            decision[field] = None if value == "unknown" else value
        contract.parse_structure(
            json.dumps(decision), contract.schema_for(text, context)
        )
        return {
            "schema_valid": True,
            "decision": decision,
            "validated": contract.validate_business(decision, text, context),
            "answers": answers,
            "encoded_text_count": len(self.encoded_texts),
            "document_cache_count": len(self.document_cache),
            "elapsed_ms": (time.perf_counter() - started) * 1000,
        }
