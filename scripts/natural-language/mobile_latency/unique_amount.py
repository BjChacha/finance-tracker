"""Let a semantic single decision confirm one non-quantity amount candidate."""

import json
import re

from backend import HERE, contract
from labels import CatalogLeanContract
from sparse_catalog import SparseCatalogClient, SparseCatalogContract

QUANTITY_SUFFIX = re.compile(
    r"[\u5f20\u4e2a\u652f\u53ea\u672c\u888b\u74f6\u4ef6\u53f0\u8f86\u4f4d\u4eba\u6b21]"
)
MONETARY_MARKER = re.compile(r"[\u5143\u5757\u89d2\u5206\u70b9.\uff0e]")


def split_amount_candidates(text, amounts):
    kept, quantities = [], []
    for amount in amounts:
        suffix = text[amount["end"] : amount["end"] + 1]
        is_quantity = (
            not MONETARY_MARKER.search(amount["text"])
            and QUANTITY_SUFFIX.fullmatch(suffix) is not None
        )
        (quantities if is_quantity else kept).append(amount)
    return kept, quantities


class UniqueAmountContract(SparseCatalogContract):
    def __init__(self, text, context):
        super().__init__(text, context)
        self.amounts, self.quantity_candidates = split_amount_candidates(
            text, self.amounts
        )
        self.schema["properties"]["amount"]["enum"] = [
            amount["id"] for amount in self.amounts
        ] + [None]

    def fields_for(self, kind):
        fields = super().fields_for(kind)
        return tuple(
            field
            for field in fields
            if not (field == "amount" and len(self.amounts) == 1)
        )

    def decode(self, response):
        value = json.loads(response, object_pairs_hook=contract.no_duplicates)
        if not isinstance(value, dict) or "type" not in value:
            raise ValueError("Expected a typed object")
        required = set(self.fields_for(value["type"]))
        if set(value) != required:
            raise ValueError("Unexpected unique-amount output fields")
        for field in set(self.field_order) - required:
            value[field] = None
        if len(self.amounts) == 1 and value["status"] == "single":
            value["amount"] = self.amounts[0]["id"]
        return CatalogLeanContract.decode(self, contract.compact_json(value))


class UniqueAmountClient(SparseCatalogClient):
    contract_type = UniqueAmountContract

    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        mapping = self.contract_type(text, context)
        user = {"text": text, "amount_candidates": mapping.amounts}
        body["messages"][1]["content"] = (
            contract.compact_json(user).replace("<", r"\u003c").replace(">", r"\u003e")
        )
        prior = (HERE / "sparse_accounts.txt").read_text(encoding="utf-8")
        system = body["messages"][0]["content"]
        if not system.endswith(prior):
            raise ValueError("Expected the frozen sparse-fields instruction suffix")
        body["messages"][0]["content"] = system[: -len(prior)] + (
            HERE / "unique_amount.txt"
        ).read_text(encoding="utf-8")
        return body

    def parse(self, text, context, cache=True):
        result = super().parse(text, context, cache)
        mapping = self.contract_type(text, context)
        result["amount_resolution"] = {
            "mode": (
                "single_status_confirms_unique_candidate"
                if len(mapping.amounts) == 1
                else "model_candidate_selection"
            ),
            "candidates": mapping.amounts,
            "excluded_quantities": mapping.quantity_candidates,
            "scope": "Derived amount IDs are not raw model amount predictions",
        }
        return result


def configure_unique_amount(server):
    server.client.fields = UniqueAmountClient(server.port)
    server.client.preload_clients = (server.client.gate, server.client.fields)
