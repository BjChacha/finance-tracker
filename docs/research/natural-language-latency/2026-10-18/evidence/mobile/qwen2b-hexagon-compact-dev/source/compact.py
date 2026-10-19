"""Status-first indexed output with validation against the existing contract."""

import json
import time

from backend import HERE, contract
from safe_constraints import SafeBranchClient

KINDS = ("expense", "income", "transfer")
DAYS = ("today", "yesterday", "before_yesterday", "unknown")


class CompactContract:
    def __init__(self, text, context):
        if not text.strip() or len(text) > 200:
            raise ValueError("Expected 1 to 200 characters")
        self.text = text
        self.context = contract.active_context(context)
        self.amounts = contract.amount_candidates(text)
        self.categories = self.context["categories"]
        self.accounts = self.context["accounts"]
        self.schema = contract.schema_for(text, context)

    def table(self):
        parents = {row["id"]: index + 1 for index, row in enumerate(self.categories)}
        return {
            "categories": [
                [
                    i + 1,
                    KINDS.index(row["type"]),
                    row["name"],
                    parents.get(row.get("parentId"), 0),
                    ";".join(row.get("examples", [])),
                ]
                for i, row in enumerate(self.categories)
            ],
            "accounts": [
                [i + 1, row["name"], row.get("aliases", [])]
                for i, row in enumerate(self.accounts)
            ],
        }

    def grammar(self):
        def choices(values):
            return "(" + " | ".join(json.dumps(str(value)) for value in values) + ")"

        allowed = self.schema["properties"]["account"]["enum"]
        accounts = [0] + [
            i + 1 for i, row in enumerate(self.accounts) if row["id"] in allowed
        ]
        amounts = choices(range(len(self.amounts) + 1))
        rules = ['root ::= "[0]" | expense | income | transfer']
        for kind_id, kind in enumerate(KINDS):
            categories = choices(
                [0]
                + [
                    i + 1
                    for i, row in enumerate(self.categories)
                    if row["type"] == kind
                ]
            )
            if kind == "transfer":
                pairs = [
                    f"{left},{right}"
                    for left in accounts
                    for right in accounts
                    if not left or not right or left != right
                ]
                account_rule = choices(pairs)
            else:
                account_rule = choices(accounts) + ' ",0"'
            rules.append(
                f'{kind} ::= "[1,{kind_id}," {amounts} "," {categories} "," '
                + account_rule
                + ' "," ("0" | "1" | "2" | "3") "]"'
            )
        return "\n".join(rules) + "\n"

    def decode(self, response):
        values = json.loads(response)
        if not isinstance(values, list) or any(
            type(value) is not int for value in values
        ):
            raise ValueError("Expected an integer array")
        if values == [0]:
            decision = {
                key: None
                for key in ("type", "amount", "category", "account", "to_account")
            }
            decision.update(status="clarify", day="unknown")
        else:
            if len(values) != 7 or values[0] != 1:
                raise ValueError("Unexpected compact output shape")
            _, kind, amount, category, account, destination, day = values
            if kind not in range(len(KINDS)) or day not in range(len(DAYS)):
                raise ValueError("Invalid type or date index")

            def resolve(index, rows):
                if not 0 <= index <= len(rows):
                    raise ValueError("Index outside active candidate table")
                return rows[index - 1]["id"] if index else None

            decision = {
                "status": "single",
                "type": KINDS[kind],
                "day": DAYS[day],
                "amount": resolve(amount, self.amounts),
                "category": resolve(category, self.categories),
                "account": resolve(account, self.accounts),
                "to_account": resolve(destination, self.accounts),
            }
        return contract.parse_structure(contract.compact_json(decision), self.schema)


class CompactClient(SafeBranchClient):
    def body_for(self, text, context, cache=True):
        mapping = CompactContract(text, context)
        user = {
            "text": text,
            "amounts": [[i + 1, row["text"]] for i, row in enumerate(mapping.amounts)],
        }
        messages = [
            {
                "role": "system",
                "content": (HERE / "compact_prompt.txt").read_text(encoding="utf-8")
                + "\n"
                + contract.compact_json(mapping.table()),
            },
            {"role": "user", "content": contract.compact_json(user)},
        ]
        for message in messages:
            message["content"] = (
                message["content"].replace("<", r"\u003c").replace(">", r"\u003e")
            )
        return {
            "messages": messages,
            "grammar": mapping.grammar(),
            "chat_template_kwargs": {"enable_thinking": False},
            "reasoning_effort": "none",
            "temperature": 0,
            "seed": 42,
            "max_tokens": 96,
            "cache_prompt": cache,
        }

    def parse(self, text, context, cache=True):
        started = time.perf_counter()
        body = self.body_for(text, context, cache)
        result = {
            "schema_valid": False,
            "decision": None,
            "validated": None,
            "request": body,
        }
        try:
            response = self.request("/v1/chat/completions", body, timeout=240)
            choice = response["choices"][0]
            message = choice["message"]
            content = message.get("content") or ""
            result.update(
                response=content,
                usage=response.get("usage"),
                timings=response.get("timings"),
                finish_reason=choice["finish_reason"],
            )
            if choice["finish_reason"] != "stop" or message.get("reasoning_content"):
                raise ValueError("Incomplete output or unexpected thinking")
            decision = CompactContract(text, context).decode(content)
            result.update(
                schema_valid=True,
                decision=decision,
                validated=contract.validate_business(decision, text, context),
            )
        except (ValueError, KeyError, TypeError, OSError) as error:
            result["error"] = str(error)
        result["elapsed_ms"] = (time.perf_counter() - started) * 1000
        return result
