"""Require explicit review where transfer direction lacks a supported proof."""

import copy

from account_evidence import TRANSFER_BRIDGE, account_mentions, audit_account_evidence


def confirm_transfer_direction(text, context, actual):
    result = copy.deepcopy(actual)
    decision = actual.get("decision") or {}
    if (
        not actual.get("schema_valid")
        or decision.get("status") != "single"
        or decision.get("type") != "transfer"
    ):
        return result
    mentions = account_mentions(text, context)
    verified = False
    if len(mentions) == 2 and all(len(m["candidate_ids"]) == 1 for m in mentions):
        source, destination = mentions
        bridge = text[source["end"] : destination["start"]]
        verified = (
            source["candidate_ids"] != destination["candidate_ids"]
            and TRANSFER_BRIDGE.fullmatch(bridge) is not None
            and decision.get("account") == source["candidate_ids"][0]
            and decision.get("to_account") == destination["candidate_ids"][0]
            and not audit_account_evidence(text, context, decision)["issues"]
        )
    result["transfer_direction_review"] = {
        "required": not verified,
        "supported_literal_direction": verified,
        "mentions": mentions,
        "scope": "Confirmation policy only; model fields are never corrected",
    }
    if not verified:
        result["before_transfer_review"] = copy.deepcopy(result["validated"])
        for field in ("account", "to_account"):
            issue = field + "_direction_confirmation_required"
            if issue not in result["validated"]["issues"]:
                result["validated"]["issues"].append(issue)
        if result["validated"]["status"] == "preview":
            result["validated"]["status"] = "needs_input"
    return result
