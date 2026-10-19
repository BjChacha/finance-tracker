"""Change only field transport to a fixed array, retaining late status selection."""

import json

from backend import contract
from lean import FIELDS, LeanClient, LeanContract


class ArrayLastContract(LeanContract):
    def grammar(self):
        grammar = super().grammar()
        for field in FIELDS:
            key = json.dumps(contract.compact_json(field)) + ' ws ":" ws '
            if grammar.count(key) != 4:
                raise ValueError("Unexpected named-field grammar")
            grammar = grammar.replace(key, "")
        return grammar.replace('"{" ws', '"[" ws').replace('"}"', '"]"')

    def decode(self, response):
        values = json.loads(response)
        if not isinstance(values, list) or len(values) != len(FIELDS):
            raise ValueError("Invalid late-status array")
        return super().decode(
            contract.compact_json(dict(zip(FIELDS, values, strict=True)))
        )


class ArrayLastClient(LeanClient):
    contract_type = ArrayLastContract

    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        body["grammar"] = ArrayLastContract(text, context).grammar()
        body["messages"][0]["content"] = body["messages"][0]["content"].replace(
            "JSON\u5bf9\u8c61", "JSON\u6570\u7ec4"
        ) + (
            "\nOutput exactly [type, amount, category, account, to_account, status]. "
            "Use the same enum values and IDs, with no field names."
        )
        return body
