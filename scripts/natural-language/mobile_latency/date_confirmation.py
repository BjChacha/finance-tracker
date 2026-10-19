"""Require a date decision for unsupported calendar words without guessing it."""

import copy
import re

UNSUPPORTED_CALENDAR = re.compile(
    r"(?:\u5468|\u661f\u671f|\u793c\u62dc)[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929\u672b]|"
    r"\u6708[\u521d\u4e2d\u672b\u5e95]|\u5e74[\u521d\u4e2d\u672b\u5e95]|"
    r"[\u524d\u53bb\u4eca\u660e\u540e]\u5e74"
)


def confirm_unsupported_date(text, actual):
    result = copy.deepcopy(actual)
    decision = result.get("decision") or {}
    if not result.get("schema_valid") or decision.get("status") != "single":
        return result
    spans = [
        {"text": match.group(), "start": match.start(), "end": match.end()}
        for match in UNSUPPORTED_CALENDAR.finditer(text)
    ]
    if not spans:
        return result
    result["date_review"] = {
        "required": True,
        "evidence": spans,
        "scope": "Conservative calendar-word review; no inferred date or raw-decision repair",
    }
    result["before_date_review"] = copy.deepcopy(result["validated"])
    result["validated"]["date"] = None
    issues = result["validated"]["issues"]
    if "date_confirmation_required" not in issues:
        issues.append("date_confirmation_required")
    if result["validated"]["status"] == "preview":
        result["validated"]["status"] = "needs_input"
    return result
