"""Map request-local candidate aliases back to active application identifiers."""

from backend import contract
from compact import CompactClient
from lean import LeanClient, LeanContract


def alias_context(context):
    active = contract.active_context(context)
    result = dict(active)
    forward = {}
    reverse = {}
    for field, prefix in (("categories", "c"), ("accounts", "a")):
        rows = active[field]
        identifiers = [row["id"] for row in rows]
        if any(not isinstance(value, str) or not value for value in identifiers):
            raise ValueError("Expected nonempty string candidate identifiers")
        if len(set(identifiers)) != len(identifiers):
            raise ValueError("Duplicate candidate identifier")
        forward[field] = {value: f"{prefix}{i}" for i, value in enumerate(identifiers)}
        reverse[field] = {value: key for key, value in forward[field].items()}
        result[field] = [{**row, "id": forward[field][row["id"]]} for row in rows]
    for row in result["categories"]:
        parent = row.get("parentId")
        if parent is not None:
            if parent not in forward["categories"]:
                raise ValueError("Category parent must be active")
            row["parentId"] = forward["categories"][parent]
    return result, reverse


class AliasLeanContract(LeanContract):
    def __init__(self, text, context):
        self.original_schema = contract.schema_for(text, context)
        aliased, self.reverse = alias_context(context)
        super().__init__(text, aliased)

    def decode(self, response):
        value = super().decode(response)
        for field, table in (
            ("category", "categories"),
            ("account", "accounts"),
            ("to_account", "accounts"),
        ):
            if value[field] is not None:
                value[field] = self.reverse[table][value[field]]
        return contract.parse_structure(
            contract.compact_json(value), self.original_schema
        )


class AliasLeanClient(CompactClient):
    contract_type = AliasLeanContract

    def __init__(self, port):
        super().__init__(port)
        self.body_client = LeanClient(port)

    def body_for(self, text, context, cache=True):
        aliased, _ = alias_context(context)
        return self.body_client.body_for(text, aliased, cache)
