"""Remove redundant context keys while preserving the original semantic rules."""

from backend import HERE, contract
from safe_constraints import SafeBranchClient


class GroupedClient(SafeBranchClient):
    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        active = contract.active_context(context)
        categories = {}
        for row in active["categories"]:
            categories.setdefault(row["type"], {})[row["id"]] = {
                "name": row["name"],
                "uses": row.get("examples", []),
                **({"parent": row["parentId"]} if row.get("parentId") else {}),
            }
        stable = {
            "now": active["now"],
            "categories": categories,
            "accounts": {
                row["id"]: [row["name"], *row.get("aliases", [])]
                for row in active["accounts"]
            },
        }
        user = {
            "text": text,
            "amount_candidates": {
                row["id"]: row["text"] for row in contract.amount_candidates(text)
            },
        }
        body["messages"] = [
            {
                "role": "system",
                "content": (HERE.parent / "mobile_instruct/prompt.txt").read_text(
                    encoding="utf-8"
                )
                + "\n"
                + contract.compact_json(stable),
            },
            {"role": "user", "content": contract.compact_json(user)},
        ]
        for message in body["messages"]:
            message["content"] = (
                message["content"].replace("<", r"\u003c").replace(">", r"\u003e")
            )
        return body

    def parse(self, text, context, cache=True):
        result = super().parse(text, context, cache)
        result["request"] = self.body_for(text, context, cache)
        return result
