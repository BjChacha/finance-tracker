"""Use meaningful enum values in a status-first array rather than numeric codes."""

import json

from backend import HERE, contract
from compact import CompactClient, CompactContract

FIELDS = ("status", "type", "amount", "category", "account", "to_account", "day")


class SemanticContract(CompactContract):
    def table(self):
        return {
            "categories": [
                [
                    row["id"],
                    row["type"],
                    row["name"],
                    row.get("parentId"),
                    ";".join(row.get("examples", [])),
                ]
                for row in self.categories
            ],
            "accounts": [
                [row["id"], row["name"], row.get("aliases", [])]
                for row in self.accounts
            ],
        }

    def grammar(self):
        def literal(value):
            return json.dumps(contract.compact_json(value))

        def choices(values):
            return "(" + " | ".join(literal(value) for value in values) + ")"

        enums = self.schema["properties"]
        branches = []
        rules = [
            "ws ::= [ \\t\\n\\r]{0,2}",
            'clarify ::= "[" ws "\\"clarify\\"" ws "]"',
        ]
        for index, kind in enumerate(("expense", "income", "transfer", None)):
            name = f"branch{index}"
            branches.append(name)
            categories = [None] + [
                row["id"] for row in self.categories if row["type"] == kind
            ]
            accounts = enums["account"]["enum"]
            if kind == "transfer":
                pairs = [
                    literal(left) + ' ws "," ws ' + literal(right)
                    for left in accounts
                    for right in accounts
                    if left is None or right is None or left != right
                ]
                pair_rule = "(" + " | ".join(pairs) + ")"
            else:
                pair_rule = choices(accounts) + ' ws "," ws "null"'
            rules.append(
                f'{name} ::= "[" ws {literal("single")} ws "," ws {literal(kind)} ws "," ws '
                + choices(enums["amount"]["enum"])
                + ' ws "," ws '
                + choices(categories)
                + ' ws "," ws '
                + pair_rule
                + ' ws "," ws '
                + choices(enums["day"]["enum"])
                + ' ws "]"'
            )
        return (
            "root ::= clarify | "
            + " | ".join(branches)
            + "\n"
            + "\n".join(rules)
            + "\n"
        )

    def decode(self, response):
        values = json.loads(response)
        if values == ["clarify"]:
            return super().decode("[0]")
        if (
            not isinstance(values, list)
            or len(values) != len(FIELDS)
            or values[0] != "single"
        ):
            raise ValueError("Invalid semantic array shape")
        return contract.parse_structure(
            contract.compact_json(dict(zip(FIELDS, values, strict=True))), self.schema
        )


class SemanticClient(CompactClient):
    contract_type = SemanticContract

    def body_for(self, text, context, cache=True):
        mapping = self.contract_type(text, context)
        user = {
            "text": text,
            "amounts": [[row["id"], row["text"]] for row in mapping.amounts],
        }
        messages = [
            {
                "role": "system",
                "content": (HERE / "semantic_prompt.txt").read_text(encoding="utf-8")
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
