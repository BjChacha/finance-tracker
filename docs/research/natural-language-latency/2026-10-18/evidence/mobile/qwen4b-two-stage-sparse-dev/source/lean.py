"""Keep named semantic fields and normalize supported relative dates in code."""

import json

from backend import contract
from compact import CompactClient, CompactContract
from revision import day_from_evidence
from safe_constraints import SafeBranchClient

FIELDS = ("type", "amount", "category", "account", "to_account", "status")


class LeanContract(CompactContract):
    field_order = FIELDS

    def fields_for(self, kind):
        return self.field_order

    def grammar(self):
        rules = ["ws ::= [ \\t\\n\\r]{0,2}"]
        branches = []
        for index, kind in enumerate(("expense", "income", "transfer", None)):
            order = self.fields_for(kind)
            parts = ['"{" ws']
            for field in order:
                values = self.schema["properties"][field]["enum"]
                if field == "type":
                    values = [kind]
                elif field == "category":
                    values = [
                        row["id"] for row in self.categories if row["type"] == kind
                    ] + [None]
                elif field == "to_account" and kind != "transfer":
                    values = [None]
                choices = " | ".join(
                    json.dumps(contract.compact_json(v)) for v in values
                )
                parts.append(
                    json.dumps(contract.compact_json(field))
                    + ' ws ":" ws ('
                    + choices
                    + ") ws"
                )
                if field != order[-1]:
                    parts.append('"," ws')
            parts.append('"}"')
            name = f"branch{index}"
            branches.append(name)
            rules.append(name + " ::= " + " ".join(parts))
        return "root ::= " + " | ".join(branches) + "\n" + "\n".join(rules) + "\n"

    def decode(self, response):
        value = json.loads(response)
        if not isinstance(value, dict) or set(value) != set(FIELDS):
            raise ValueError("Unexpected lean output fields")
        value["day"] = day_from_evidence(self.text)
        return contract.parse_structure(contract.compact_json(value), self.schema)


class LeanClient(CompactClient):
    contract_type = LeanContract

    def body_for(self, text, context, cache=True):
        body = SafeBranchClient.body_for(self, text, context, cache)
        mapping = self.contract_type(text, context)
        body["grammar"] = mapping.grammar()
        system = body["messages"][0]["content"]
        system = "\n".join(
            line for line in system.splitlines() if not line.startswith("day")
        )
        system = system.replace(
            "to_account\u3001day\u3001status", "to_account\u3001status"
        )
        body["messages"][0]["content"] = system
        return body
