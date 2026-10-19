"""Change only field decoding order while retaining the frozen semantic prompt."""

import json

from backend import contract
from safe_constraints import SafeBranchClient


class StatusFirstClient(SafeBranchClient):
    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        schema = contract.schema_for(text, context)
        categories = contract.active_context(context)["categories"]
        order = ("status", "type", "amount", "category", "account", "to_account", "day")
        rules = ["ws ::= [ \\t\\n\\r]{0,2}"]
        branches = []
        for index, kind in enumerate(("expense", "income", "transfer", None)):
            parts = ['"{" ws']
            for field in order:
                values = schema["properties"][field]["enum"]
                if field == "type":
                    values = [kind]
                elif field == "category":
                    values = [
                        row["id"] for row in categories if row["type"] == kind
                    ] + [None]
                elif field == "to_account" and kind != "transfer":
                    values = [None]
                alternatives = " | ".join(
                    json.dumps(contract.compact_json(value)) for value in values
                )
                parts.append(
                    json.dumps(contract.compact_json(field))
                    + ' ws ":" ws ('
                    + alternatives
                    + ") ws"
                )
                if field != order[-1]:
                    parts.append('"," ws')
            parts.append('"}"')
            name = f"branch{index}"
            branches.append(name)
            rules.append(name + " ::= " + " ".join(parts))
        body["grammar"] = (
            "root ::= " + " | ".join(branches) + "\n" + "\n".join(rules) + "\n"
        )
        return body
