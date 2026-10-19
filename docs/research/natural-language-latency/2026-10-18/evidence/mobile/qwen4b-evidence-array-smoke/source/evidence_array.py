"""Restore deterministic money evidence while keeping the semantic array format."""

import json

from backend import contract
from semantic import SemanticClient


class EvidenceArrayClient(SemanticClient):
    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        body["messages"][0]["content"] += (
            "\nEach amount row is [id, original text, integer cents]. "
            "The cents are already converted by the application."
        )
        user = {
            "text": text,
            "amounts": [
                [row["id"], row["text"], row["cents"]]
                for row in contract.amount_candidates(text)
            ],
        }
        body["messages"][1]["content"] = (
            json.dumps(user, ensure_ascii=False, separators=(",", ":"))
            .replace("<", r"\u003c")
            .replace(">", r"\u003e")
        )
        return body
