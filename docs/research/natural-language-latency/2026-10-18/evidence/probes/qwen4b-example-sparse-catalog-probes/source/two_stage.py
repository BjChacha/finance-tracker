"""Compose independent eligibility and field extraction without authorizing writes."""

import json
import time

from backend import HERE, contract
from lean import LeanClient, LeanContract
from revision import day_from_evidence
from semantic_gate import SemanticGateClient


class StatusFirstLeanContract(LeanContract):
    field_order = ("status", "type", "amount", "category", "account", "to_account")


class SparseNullAccounts:
    def fields_for(self, kind):
        return tuple(
            field
            for field in self.field_order
            if not (
                field == "account"
                and self.schema["properties"][field]["enum"] == [None]
            )
            and not (
                field == "to_account"
                and (
                    kind != "transfer"
                    or self.schema["properties"][field]["enum"] == [None]
                )
            )
        )

    def decode(self, response):
        value = json.loads(response, object_pairs_hook=contract.no_duplicates)
        if not isinstance(value, dict) or "type" not in value:
            raise ValueError("Expected a typed object")
        required = set(self.fields_for(value["type"]))
        if set(value) != required:
            raise ValueError("Unexpected sparse output fields")
        for field in set(self.field_order) - required:
            value[field] = None
        return super().decode(contract.compact_json(value))


class SparseAccountsContract(SparseNullAccounts, StatusFirstLeanContract):
    pass


class SlottedFieldsClient(LeanClient):
    contract_type = StatusFirstLeanContract
    slot = 1

    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        body["id_slot"] = self.slot
        return body


class SparseFieldsClient(SlottedFieldsClient):
    contract_type = SparseAccountsContract

    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        body["messages"][0]["content"] += "\n" + (
            HERE / "sparse_accounts.txt"
        ).read_text(encoding="utf-8")
        return body


class SlottedGateClient(SemanticGateClient):
    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        body["id_slot"] = 0
        return body


class TwoStageClient(LeanClient):
    def __init__(self, port):
        super().__init__(port)
        self.gate = SlottedGateClient(port)
        self.fields = SlottedFieldsClient(port)

    def parse(self, text, context, cache=True):
        started = time.perf_counter()
        gate = self.gate.parse(text, context, cache)
        result = {
            "schema_valid": False,
            "decision": None,
            "validated": None,
            "gate": gate,
            "extraction_performed": False,
        }
        if not gate["schema_valid"]:
            result["error"] = "Eligibility classification failed"
        elif gate["status"] == "clarify":
            decision = dict.fromkeys(
                ("type", "amount", "category", "account", "to_account")
            )
            decision.update(status="clarify", day=day_from_evidence(text))
            result.update(
                schema_valid=True,
                decision=decision,
                validated=contract.validate_business(decision, text, context),
                response=gate["response"],
                request=gate["request"],
            )
        elif gate["status"] == "single":
            extraction = self.fields.parse(text, context, cache)
            result.update(extraction)
            result["extraction_performed"] = True
            result["extraction_elapsed_ms"] = extraction["elapsed_ms"]
        else:
            result["error"] = "Unknown eligibility classification"
        result["elapsed_ms"] = (time.perf_counter() - started) * 1000
        return result


def configure_two_stage(server, layout="split", sparse=False):
    if layout not in ("split", "unified", "single"):
        raise ValueError("Unknown KV cache layout")
    server.arguments[server.arguments.index("-np") + 1] = (
        "1" if layout == "single" else "2"
    )
    server.arguments[server.arguments.index("-c") + 1] = (
        "8192" if layout == "split" else "4096"
    )
    if layout == "unified":
        server.arguments.append("--kv-unified")
    if layout == "single":
        server.arguments.extend(["--cache-ram", "512"])
    server.client = TwoStageClient(server.port)
    if sparse:
        server.client.fields = SparseFieldsClient(server.port)
    if layout == "single":
        server.client.fields.slot = 0
