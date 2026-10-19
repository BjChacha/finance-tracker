"""Constrained candidate selection and deterministic accounting validation."""

import json
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import HERE as LEGACY
from common import read_json
from money import parse_money

HERE = Path(__file__).resolve().parent
FIELDS = ("status", "type", "amount", "category", "account", "to_account", "day")
NUM = r"[0-9\uff10-\uff19\u96f6\u3007\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07]+"
DECIMAL = rf"{NUM}(?:[.\uff0e\u70b9]{NUM})?"
NUMBER = rf"(?:[0-9]{{1,3}}(?:,[0-9]{{3}})+(?:\.[0-9]+)?|{DECIMAL})"
AMOUNT_PATTERN = re.compile(
    rf"[-\u8d1f]?{NUMBER}(?:[\u5143\u5757](?:{NUMBER}[\u89d2\u6bdb](?:{NUMBER}\u5206)?|{NUMBER}\u5206|{NUMBER})?|[\u89d2\u6bdb](?:{NUMBER}\u5206)?|\u5206)?[\u94b1\u6574]?"
)


def amount_candidates(text):
    result = []
    for match in AMOUNT_PATTERN.finditer(text):
        cents = parse_money(match.group())
        if cents is not None:
            result.append(
                {
                    "id": f"m{len(result)}",
                    "text": match.group(),
                    "start": match.start(),
                    "end": match.end(),
                    "cents": cents,
                }
            )
    return result


def active_context(context):
    return {
        **context,
        "accounts": [row for row in context["accounts"] if row.get("active", True)],
        "categories": [
            row for row in context["categories"] if not row.get("archived", False)
        ],
    }


def mentioned_accounts(text, context):
    active = active_context(context)["accounts"]
    return [
        row
        for row in active
        if any(name in text for name in [row["name"], *row.get("aliases", [])])
        and sum(other["name"] == row["name"] for other in active) == 1
    ]


def schema_for(text, context):
    context = active_context(context)
    enums = {
        "status": ["single", "clarify"],
        "type": ["expense", "income", "transfer", None],
        "amount": [*[row["id"] for row in amount_candidates(text)], None],
        "category": [*[row["id"] for row in context["categories"]], None],
        "account": [*[row["id"] for row in mentioned_accounts(text, context)], None],
        "to_account": [*[row["id"] for row in mentioned_accounts(text, context)], None],
        "day": ["today", "yesterday", "before_yesterday", "unknown"],
    }
    return {
        "type": "object",
        "properties": {field: {"enum": enums[field]} for field in FIELDS},
        "required": list(FIELDS),
        "additionalProperties": False,
    }


def grammar_for(text, context):
    schema = schema_for(text, context)
    categories = active_context(context)["categories"]
    order = ("type", "amount", "category", "account", "to_account", "day", "status")
    branches = []
    rules = ["ws ::= [ \\t\\n\\r]{0,2}"]
    for index, kind in enumerate(("expense", "income", "transfer", None)):
        parts = [json.dumps("{") + " ws"]
        for field in order:
            values = schema["properties"][field]["enum"]
            if field == "type":
                values = [kind]
            elif field == "category":
                values = [row["id"] for row in categories if row["type"] == kind] + [
                    None
                ]
            elif field == "to_account" and kind != "transfer":
                values = [None]
            alternatives = " | ".join(
                json.dumps(compact_json(value)) for value in values
            )
            parts.append(
                json.dumps(compact_json(field)) + ' ws ":" ws (' + alternatives + ") ws"
            )
            if field != order[-1]:
                parts.append('"," ws')
        parts.append(json.dumps("}"))
        name = f"branch-{index}"
        branches.append(name)
        rules.append(name + " ::= " + " ".join(parts))
    return "root ::= " + " | ".join(branches) + "\n" + "\n".join(rules) + "\n"


def bounded_grammar(schema):
    parts = ['"{" ws']
    for index, field in enumerate(FIELDS):
        choices = " | ".join(
            json.dumps(compact_json(value))
            for value in schema["properties"][field]["enum"]
        )
        parts.append(
            json.dumps(compact_json(field)) + ' ws ":" ws (' + choices + ") ws"
        )
        if index < len(FIELDS) - 1:
            parts.append('"," ws')
    parts.append('"}"')
    return "root ::= " + " ".join(parts) + "\nws ::= [ \\t\\n\\r]{0,2}\n"


def compact_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def prompt_for(text, context, with_examples=True, prompt_file=None):
    if not text.strip() or len(text) > 200:
        raise ValueError("Expected 1 to 200 characters")
    context = active_context(context)
    task_context = {
        "now": context["now"],
        "categories": [
            {key: row[key] for key in ("id", "type", "name", "parentId") if key in row}
            for row in context["categories"]
        ],
        "accounts": [
            {key: row[key] for key in ("id", "name", "aliases") if key in row}
            for row in mentioned_accounts(text, context)
        ],
    }
    system = Path(prompt_file or HERE / "prompt.txt").read_text(encoding="utf-8")
    if prompt_file and Path(prompt_file).name in (
        "prompt-short.txt",
        "prompt-zh.txt",
        "prompt-final.txt",
    ):
        for kind in ("income", "expense", "transfer"):
            system += (
                "\n"
                + kind
                + " categories: "
                + "; ".join(
                    f"{row['id']}={row['name']}"
                    for row in task_context["categories"]
                    if row["type"] == kind
                )
            )
        system += "\nAccounts: " + compact_json(task_context["accounts"])
    else:
        system += "\n" + compact_json(task_context)
    turns = [("system", system)]
    if with_examples:
        for example in read_json(HERE / "examples.json"):
            turns.append(
                (
                    "user",
                    compact_json(
                        {
                            "text": example["text"],
                            "amount_candidates": amount_candidates(example["text"]),
                        }
                    ),
                )
            )
            turns.append(("assistant", compact_json(example["answer"])))
    if prompt_file and Path(prompt_file).name == "prompt-final.txt":
        candidates = [
            {"id": row["id"], "text": row["text"]} for row in amount_candidates(text)
        ]
        turns.append(
            ("user", text + "\nAmount candidates: " + compact_json(candidates))
        )
    else:
        turns.append(
            (
                "user",
                compact_json(
                    {"text": text, "amount_candidates": amount_candidates(text)}
                ),
            )
        )
    # Escape special-token delimiters inside data, while preserving the chat template.
    return (
        "".join(
            f"<|im_start|>{role}\n{content.replace('<|', '<\\u007c')}<|im_end|>\n"
            for role, content in turns
        )
        + "<|im_start|>assistant\n"
    )


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON property")
        result[key] = value
    return result


def parse_structure(content, schema):
    value = json.loads(content, object_pairs_hook=no_duplicates)
    if not isinstance(value, dict) or set(value) != set(FIELDS):
        raise ValueError("Unexpected JSON structure")
    for key in FIELDS:
        if value[key] not in schema["properties"][key]["enum"]:
            raise ValueError(f"Invalid enum value for {key}")
    return value


def validate_business(decision, text, context):
    context = active_context(context)
    amounts = {row["id"]: row for row in amount_candidates(text)}
    categories = {row["id"]: row for row in context["categories"]}
    accounts = {row["id"]: row for row in context["accounts"]}
    issues, violations = [], []
    amount = amounts.get(decision["amount"])
    category = categories.get(decision["category"])
    transaction_type = decision["type"]
    if amount is None:
        issues.append("amount_required")
    if transaction_type is None:
        issues.append("type_required")
    if category is None:
        issues.append("category_required")
    elif category["type"] != transaction_type:
        violations.append("category_type_mismatch")
    if decision["account"] is None:
        issues.append("account_required")
    for field in ("account", "to_account"):
        account = accounts.get(decision[field])
        if decision[field] is not None and account is None:
            violations.append(f"{field}_unknown")
        if account is not None:
            aliases = [account["name"], *account.get("aliases", [])]
            if not any(alias in text for alias in aliases):
                violations.append(f"{field}_not_grounded")
            if sum(other["name"] == account["name"] for other in accounts.values()) > 1:
                violations.append(f"{field}_ambiguous")
    if transaction_type == "transfer":
        if decision["to_account"] is None:
            issues.append("destination_required")
        elif decision["account"] == decision["to_account"]:
            violations.append("same_transfer_account")
    elif decision["to_account"] is not None:
        violations.append("unexpected_destination")
    if decision["status"] != "single":
        issues.append("not_clear_single")
    if decision["day"] == "unknown":
        issues.append("date_required")
    offset = {"today": 0, "yesterday": 1, "before_yesterday": 2}.get(decision["day"])
    date = (
        (datetime.fromisoformat(context["now"]) - timedelta(days=offset)).isoformat()
        if offset is not None
        else None
    )
    return {
        "status": "invalid" if violations else "needs_input" if issues else "preview",
        "amount_cents": amount["cents"] if amount else None,
        "amount_evidence": amount,
        "type": transaction_type,
        "category": category["id"]
        if category and "category_type_mismatch" not in violations
        else None,
        "account": decision["account"],
        "to_account": decision["to_account"],
        "date": date,
        "note": text,
        "issues": issues,
        "violations": violations,
    }


def default_context():
    return read_json(LEGACY / "data" / "context.json")


def context_for(row):
    context = default_context()
    variant = row.get("context_variant", "default")
    if variant == "craft":
        context["categories"].append(
            {"id": "craft", "name": "\u624b\u5de5\u6750\u6599", "type": "expense"}
        )
    elif variant == "duplicate_account":
        context["accounts"].append(
            {"id": "bank_copy", "name": "\u94f6\u884c\u5361", "active": True}
        )
    elif variant != "default":
        raise ValueError("Unknown context variant")
    return context
