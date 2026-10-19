"""Allow natural JSON spacing without changing the compact mapping or prompt."""

import json
import re

from compact import CompactClient


def allow_spacing(grammar):
    def expand(match):
        literal = json.loads(match.group())
        parts = re.split(r"([\[\],])", literal)
        return " ws ".join(json.dumps(part) for part in parts if part)

    return re.sub(r'"(?:\\.|[^"\\])*"', expand, grammar) + "ws ::= [ \\t\\n\\r]{0,2}\n"


class WhitespaceCompactClient(CompactClient):
    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        body["grammar"] = allow_spacing(body["grammar"])
        return body
