"""Map request-local candidate aliases back to active application identifiers."""

from backend import contract
from compact import CompactClient
from lean import LeanClient, LeanContract


def alias_context(context, labeler=None):
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
        labels = (
            labeler(field, rows)
            if labeler is not None
            else [f"{prefix}{i}" for i in range(len(rows))]
        )
        if len(labels) != len(rows) or len(set(labels)) != len(labels):
            raise ValueError("Candidate labels must be unique and complete")
        if any(not isinstance(label, str) or not label for label in labels):
            raise ValueError("Expected nonempty string candidate labels")
        forward[field] = dict(zip(identifiers, labels, strict=True))
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
    context_mapper = staticmethod(alias_context)

    def __init__(self, text, context):
        self.original_schema = contract.schema_for(text, context)
        aliased, self.reverse = self.context_mapper(context)
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
    context_mapper = staticmethod(alias_context)

    def __init__(self, port):
        super().__init__(port)
        self.body_client = LeanClient(port)

    def body_for(self, text, context, cache=True):
        aliased, _ = self.context_mapper(context)
        return self.body_client.body_for(text, aliased, cache)
