"""Audit account evidence without changing or repairing model decisions."""

import re
from itertools import pairwise

FIELDS = ("account", "to_account")
UNCERTAIN_ACCOUNT = re.compile(
    r"(?:\u5fd8\u8bb0\u4e86?|\u5fd8\u4e86|\u8bb0\u4e0d\u6e05|\u4e0d\u8bb0\u5f97|\u4e0d\u786e\u5b9a|\u4e0d\u6e05\u695a)"
    r"[^\uff0c\u3002\uff1b,;\n]{0,8}"
    r"(?:\u54ea\u5f20|\u54ea\u4e2a\u8d26\u6237|\u54ea\u4e00\u4e2a\u8d26\u6237|\u54ea\u5bb6\u94f6\u884c)"
)
TRANSFER_BRIDGE = re.compile(
    r"\s*(?:\u7684)?(?:\u4f59\u989d)?"
    r"(?:\u8f6c(?:\u8d26)?|\u63d0\u73b0|\u6c47)"
    r"(?:[0-9\u96f6\u3007\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07.\u70b9]+"
    r"(?:\u5143|\u5757)?)?"
    r"(?:\u5230|\u81f3|\u5165|\u7ed9)?\s*"
)


def account_mentions(text, context):
    """Keep longest literal spans and all IDs sharing each surviving surface."""
    surfaces = {}
    for row in context["accounts"]:
        if not row.get("active", True):
            continue
        for alias in (row["name"], *row.get("aliases", [])):
            if alias:
                surfaces.setdefault(alias, set()).add(row["id"])
    spans = {}
    for alias, ids in surfaces.items():
        for match in re.finditer(re.escape(alias), text, re.IGNORECASE):
            spans.setdefault(match.span(), set()).update(ids)
    return [
        {
            "start": start,
            "end": end,
            "text": text[start:end],
            "candidate_ids": sorted(ids),
        }
        for (start, end), ids in sorted(spans.items())
        if not any(
            left <= start and end <= right and (left, right) != (start, end)
            for left, right in spans
        )
    ]


def audit_account_evidence(text, context, decision):
    """Return confirmation requirements, never inferred replacement accounts.

    Literal ownership, quoted language, and unsupported transfer constructions
    remain semantic responsibilities of the model and the confirmation form.
    """
    mentions = account_mentions(text, context)
    issues = []
    uncertainty = list(UNCERTAIN_ACCOUNT.finditer(text))
    for field in FIELDS:
        selected = decision.get(field)
        if selected is None:
            continue
        matching = [m for m in mentions if selected in m["candidate_ids"]]
        unique = [m for m in matching if len(m["candidate_ids"]) == 1]
        if not matching:
            issues.append(
                {"code": "account_evidence_missing", "field": field, "evidence": []}
            )
        elif not unique:
            issues.append(
                {
                    "code": "account_alias_ambiguous",
                    "field": field,
                    "evidence": matching,
                }
            )
        if uncertainty:
            # Scope is deliberately conservative; only require confirmation.
            issues.append(
                {
                    "code": "account_uncertainty_stated",
                    "field": field,
                    "evidence": [
                        {"text": m.group(), "start": m.start(), "end": m.end()}
                        for m in uncertainty
                    ],
                }
            )
    if decision.get("type") == "transfer":
        for source, destination in pairwise(mentions):
            if (
                len(source["candidate_ids"]) != 1
                or len(destination["candidate_ids"]) != 1
                or source["end"] > destination["start"]
            ):
                continue
            bridge = text[source["end"] : destination["start"]]
            if not TRANSFER_BRIDGE.fullmatch(bridge):
                continue
            for field, mention in zip(FIELDS, (source, destination)):
                selected = decision.get(field)
                if selected is not None and selected != mention["candidate_ids"][0]:
                    issues.append(
                        {
                            "code": "transfer_role_conflict",
                            "field": field,
                            "evidence": [source, destination],
                            "bridge": bridge,
                        }
                    )
    return {
        "mentions": mentions,
        "issues": issues,
        "confirmation_fields": sorted({issue["field"] for issue in issues}),
    }


def attach_account_audit(text, context, actual):
    """Retain the frozen validator output and expose a separate readiness gate."""
    audit = audit_account_evidence(text, context, actual["decision"])
    return {
        "actual": actual,
        "account_audit": audit,
        "preview_ready": actual["validated"]["status"] == "preview"
        and not audit["issues"],
    }
