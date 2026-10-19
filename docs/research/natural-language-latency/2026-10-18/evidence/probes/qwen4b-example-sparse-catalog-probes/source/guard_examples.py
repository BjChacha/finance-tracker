"""Evaluate short contrasting examples without changing constraints or validation."""

from backend import HERE
from lean import LeanClient


class GuardExamplesClient(LeanClient):
    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        body["messages"][0]["content"] += "\n" + (
            HERE / "guard_examples.txt"
        ).read_text(encoding="utf-8")
        return body
