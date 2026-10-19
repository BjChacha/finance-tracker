"""Ask explicitly for occurred transaction count instead of binary status."""

import json

from backend import HERE, contract
from lean import LeanClient, LeanContract


class CountContract(LeanContract):
    def grammar(self):
        literal = lambda value: json.dumps(contract.compact_json(value))
        previous = "(" + " | ".join(literal(v) for v in ("single", "clarify")) + ")"
        replacement = "(" + " | ".join(literal(v) for v in (0, 1, 2, 3)) + ")"
        grammar = super().grammar()
        if grammar.count(previous) != 4:
            raise ValueError("Unexpected parent status grammar")
        return grammar.replace(literal("status"), literal("count")).replace(
            previous, replacement
        )

    def decode(self, response):
        value = json.loads(response)
        if not isinstance(value, dict) or "status" in value:
            raise ValueError("Expected count output")
        count = value.pop("count", None)
        if type(count) is not int or count not in (0, 1, 2, 3):
            raise ValueError("Invalid occurred transaction count")
        value["status"] = "single" if count == 1 else "clarify"
        return super().decode(contract.compact_json(value))


class CountingClient(LeanClient):
    contract_type = CountContract

    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        body["grammar"] = CountContract(text, context).grammar()
        stable_context = body["messages"][0]["content"].rsplit("\n", 1)[-1]
        body["messages"][0]["content"] = (
            (HERE / "count_prompt.txt").read_text(encoding="utf-8")
            + "\n"
            + stable_context
        )
        return body
