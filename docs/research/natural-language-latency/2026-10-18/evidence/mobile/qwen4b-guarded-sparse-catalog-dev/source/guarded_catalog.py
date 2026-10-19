"""Compose semantic eligibility with explicit protocol and account confirmation gates."""

import copy
import re
import time

from account_evidence import audit_account_evidence
from backend import contract
from labels import CatalogLeanClient
from revision import day_from_evidence
from two_stage import TwoStageClient

CHAT_BOUNDARY = re.compile(
    r"<\|(?:im_start|im_end|im_sep|system|user|assistant)\|>|\[/?INST\]"
)


class GuardedCatalogClient(TwoStageClient):
    def __init__(self, port, sparse=False):
        super().__init__(port)
        self.fields = CatalogLeanClient(port)
        if sparse:
            from sparse_catalog import SparseCatalogClient

            self.fields = SparseCatalogClient(port)
        self.preload_clients = (self.gate, self.fields)

    def parse(self, text, context, cache=True):
        if not text.strip() or len(text) > 200:
            raise ValueError("Expected 1 to 200 characters")
        started = time.perf_counter()
        markers = list(CHAT_BOUNDARY.finditer(text))
        if markers:
            decision = dict.fromkeys(
                ("type", "amount", "category", "account", "to_account")
            )
            decision.update(status="clarify", day=day_from_evidence(text))
            return {
                "schema_valid": True,
                "decision": decision,
                "validated": contract.validate_business(decision, text, context),
                "input_guard": {
                    "reason": "reserved_chat_boundary",
                    "spans": [[m.start(), m.end()] for m in markers],
                },
                "extraction_performed": False,
                "model_called": False,
                "elapsed_ms": (time.perf_counter() - started) * 1000,
            }
        result = super().parse(text, context, cache)
        result["model_called"] = True
        if result["schema_valid"]:
            audit = audit_account_evidence(text, context, result["decision"])
            result["account_audit"] = audit
            if audit["issues"]:
                result["base_validated"] = result["validated"]
                result["validated"] = copy.deepcopy(result["validated"])
                result["validated"]["issues"].extend(
                    f"{field}_confirmation_required"
                    for field in audit["confirmation_fields"]
                )
                if result["validated"]["status"] == "preview":
                    result["validated"]["status"] = "needs_input"
        result["elapsed_ms"] = (time.perf_counter() - started) * 1000
        return result


def configure_guarded_catalog(server, sparse=False):
    server.arguments.extend(["--cache-ram", "512"])
    server.client = GuardedCatalogClient(server.port, sparse)
