"""Controlled prompt/candidate ablations with the frozen validator intact."""

import json
import re
import time
from copy import deepcopy

from bridge import HERE, DecisionParser, PromptAdapter, PromptConfig, contract, read_json

VARIANTS = {
    "baseline": set(),
    "no_ids": {"no_ids"},
    "compact": {"no_ids", "compact"},
    "paired": {"no_ids", "compact", "paired"},
    "boundary": {"no_ids", "compact", "paired", "boundary"},
    "joint": {"no_ids", "compact", "paired", "boundary", "joint"},
    "category_only": {"category_response"},
    "refined": {"category_response", "paired", "boundary"},
    "type_prototypes": {"category_response", "paired", "boundary", "type_prototypes"},
    "all_prototypes": {"category_response", "paired", "boundary", "type_prototypes", "status_prototypes"},
    "category_joint": {"paired", "boundary", "semantic_joint"},
    "oracle_type": {"oracle_type"},
}


def day_from_evidence(text):
    mapping = {
        "\u524d\u5929": "before_yesterday",
        "\u6628\u5929": "yesterday",
        "\u6628\u665a": "yesterday",
        "\u6628\u65e5": "yesterday",
        "\u4eca\u5929": "today",
        "\u4eca\u65e5": "today",
        "\u4eca\u65e9": "today",
    }
    found = {day for word, day in mapping.items() if word in text}
    if len(found) > 1:
        return "unknown"
    if re.search(
        r"\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d+\u6708\d+\u65e5|"
        r"(?:\u4e0a|\u4e0b)(?:\u5468|\u661f\u671f|\u4e2a\u6708)|"
        r"\u660e\u5929|\u540e\u5929|\u5927\u524d\u5929",
        text,
    ):
        return "unknown"
    return next(iter(found), "today")


def explicit_category(text, context, kind):
    matches = []
    for row in context["categories"]:
        if row["type"] != kind:
            continue
        pattern = (
            r"(?:\u8bb0\u5728|\u8bb0\u5230|\u5f52\u5165|\u5206\u7c7b\u4e3a|\u7c7b\u522b\u662f)"
            + r"[\s\u201c\u300c]*"
            + re.escape(row["name"])
            + r"(?=$|[\s\u201d\u300d\uff0c\u3002\uff1b,.;])"
        )
        if re.search(pattern, text):
            matches.append(row["id"])
    return matches[0] if len(matches) == 1 else None


class VariantParser(DecisionParser):
    def __init__(self, encoder, variant):
        super().__init__(encoder)
        self.variant = variant
        self.flags = VARIANTS[variant]
        self.compact = read_json(HERE / "compact-prompts.json")
        self.prototypes = read_json(HERE / "prototypes.json")
        self.oracle_kind = None
        if "no_ids" in self.flags:
            self.prompt_config = PromptConfig(choice_candidate_template="{text}")
            self.adapter = PromptAdapter(self.prompt_config)

    def category_criteria(self, kind=None):
        criteria = {}
        categories = {row["id"]: row for row in self.context["categories"]}
        for row in categories.values():
            if kind is not None and row["type"] != kind:
                continue
            name = row["name"]
            if row.get("parentId") in categories:
                name = categories[row["parentId"]]["name"] + " / " + name
            criteria[row["id"]] = name + ": " + "; ".join(row.get("examples", []))
        criteria["unknown"] = self.compact["category_unknown"]
        return criteria

    def choices(self, text, questions):
        questions = deepcopy(questions)
        pairs = None
        extra_answers = {}
        if "semantic_joint" in self.flags and "type" in questions:
            extra_answers.update(self.text_choices(text, {
                "joint_category": self.question(
                    self.compact["category_instruction"], self.category_criteria()
                )
            }))
        if "semantic_joint" in self.flags and "category" in questions and self.joint_answer:
            questions.pop("category")
        if "category_response" in self.flags and "category" in questions:
            questions.pop("category")
            criteria = self.category_criteria(self.kind)
            for key in criteria:
                if key != "unknown":
                    name, examples = criteria[key].split(": ", 1)
                    criteria[key] = f"\u8fd9\u7b14\u4ea4\u6613\u5c5e\u4e8e{name}\u5206\u7c7b\uff1a{examples}"
                else:
                    criteria[key] = self.prompts["category_unknown"]
            extra_answers.update(self.text_choices(text, {
                "category": self.question("\u5224\u65ad\u8fd9\u7b14\u4ea4\u6613\u7684\u5206\u7c7b\u3002", criteria)
            }))
        prototype_fields = {}
        for field in ("type", "status"):
            if f"{field}_prototypes" in self.flags and field in questions:
                questions.pop(field)
                prototype_fields[field] = self.prototypes[field]
        if prototype_fields:
            picked = self.text_choices(text, {
                field: self.question(self.prompts[field]["instruction"], {
                    f"p{index}": entry[1] for index, entry in enumerate(entries)
                }) for field, entries in prototype_fields.items()
            })
            for field, answer in picked.items():
                extra_answers[field + "_prototype"] = deepcopy(answer)
                answer["choice"] = prototype_fields[field][int(answer["choice"][1:])][0]
                extra_answers[field] = answer
        if "compact" in self.flags:
            for field in ("status", "type"):
                if field in questions:
                    spec = self.compact[field]
                    questions[field] = self.question(spec["instruction"], spec["criteria"])
            if "category" in questions:
                questions["category"] = self.question(
                    self.compact["category_instruction"],
                    self.category_criteria(self.kind),
                )
        if "joint" in self.flags and "type" in questions:
            questions["joint_category"] = self.question(
                self.compact["category_instruction"], self.category_criteria()
            )
        if "joint" in self.flags and "category" in questions and self.joint_answer:
            questions.pop("category")
        if "boundary" in self.flags:
            questions.pop("day", None)
        if "paired" in self.flags and "to_account" in questions:
            questions.pop("account", None)
            questions.pop("to_account")
            accounts = contract.mentioned_accounts(text, self.context)
            pairs, criteria = {}, {}
            for source in [None, *accounts]:
                for destination in [None, *accounts]:
                    if source and destination and source["id"] == destination["id"]:
                        continue
                    key = f"route_{len(pairs)}"
                    pairs[key] = (
                        source["id"] if source else None,
                        destination["id"] if destination else None,
                    )
                    if source and destination:
                        description = self.compact["pair_template"].format(
                            source=source["name"], destination=destination["name"]
                        )
                    elif source:
                        description = self.compact["source_only_template"].format(source=source["name"])
                    elif destination:
                        description = self.compact["destination_only_template"].format(destination=destination["name"])
                    else:
                        description = self.compact["pair_unknown"]
                    criteria[key] = description
            questions["route"] = self.question(self.compact["pair_instruction"], criteria)
        answers = super().choices(text, questions) if questions else {}
        answers.update(extra_answers)
        if "type" in answers:
            if "oracle_type" in self.flags and self.oracle_kind:
                answers["type_original"] = deepcopy(answers["type"])
                answers["type"]["choice"] = self.oracle_kind
            if "joint_category" in answers:
                candidate = answers["joint_category"]["choice"]
                category = next((r for r in self.context["categories"] if r["id"] == candidate), None)
                if category:
                    self.joint_answer = answers["joint_category"]
                    answers["type_independent"] = deepcopy(answers["type"])
                    answers["type"]["choice"] = category["type"]
            self.kind = answers["type"]["choice"]
        if self.joint_answer and "type" not in answers:
            answers["category"] = self.joint_answer
        if "boundary" in self.flags:
            answers["day"] = {"choice": day_from_evidence(text), "source": "date_evidence_or_default"}
        if pairs is not None:
            source, destination = pairs[answers["route"]["choice"]]
            answers["route"]["candidates"] = pairs
            answers["account"] = {"choice": source or "unknown", "source": "joint_route"}
            answers["to_account"] = {"choice": destination or "unknown", "source": "joint_route"}
        return answers

    def text_choices(self, text, questions):
        previous_config, previous_adapter = self.prompt_config, self.adapter
        try:
            self.prompt_config = PromptConfig(choice_candidate_template="{text}")
            self.adapter = PromptAdapter(self.prompt_config)
            return super().choices(text, questions)
        finally:
            self.prompt_config, self.adapter = previous_config, previous_adapter

    def parse(self, text, context):
        started = time.perf_counter()
        self.context = contract.active_context(context)
        self.kind, self.joint_answer = None, None
        result = super().parse(text, context)
        before = deepcopy(result["decision"])
        if "boundary" in self.flags:
            decision = result["decision"]
            selected = explicit_category(text, self.context, decision["type"])
            if selected:
                decision["category"] = selected
            if not contract.amount_candidates(text):
                decision["status"] = "clarify"
            # Keep useful fields, but never permit a self-transfer to be saved.
            if decision["type"] == "transfer" and decision["account"] == decision["to_account"]:
                decision["account"] = decision["to_account"] = None
            result["decision_before_boundary"] = before
            contract.parse_structure(json.dumps(decision), contract.schema_for(text, context))
            result["validated"] = contract.validate_business(decision, text, context)
        result["elapsed_ms"] = (time.perf_counter() - started) * 1000
        return result
