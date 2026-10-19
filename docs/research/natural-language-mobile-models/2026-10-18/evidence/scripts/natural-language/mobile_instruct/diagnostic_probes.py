"""Probe known guard blind spots; keep these out of frozen accuracy denominators."""

import json

from branch_constraints import BranchClient, BranchDesktop
from runtime import ARTIFACTS, HERE, Client, contract, sha256, write_json


class EscapedClient(BranchClient):
    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        for message in body["messages"]:
            message["content"] = (
                message["content"].replace("<", r"\u003c").replace(">", r"\u003e")
            )
        return body


def main():
    output = ARTIFACTS / "desktop-diagnostic-probes"
    output.mkdir(parents=True, exist_ok=False)
    rows = json.loads((HERE / "probes.json").read_text(encoding="utf-8"))
    write_json(
        output / "manifest.json",
        {
            "source_hashes": {
                name: sha256(HERE / name)
                for name in (
                    "probes.json",
                    "diagnostic_probes.py",
                    "branch_constraints.py",
                )
            },
            "scope": "Post-regression diagnostic pairs with explicit accounts, not independent test accuracy",
        },
    )
    server = BranchDesktop()
    server.port = 18486
    server.client = Client(server.port)
    records = []
    with server, (output / "predictions.jsonl").open("w", encoding="utf-8") as stream:
        for name, client_type in (
            ("schema", Client),
            ("branch", BranchClient),
            ("escaped_branch", EscapedClient),
        ):
            client = client_type(server.port)
            for row in rows:
                actual = client.parse(row["text"], contract.default_context())
                result = {"variant": name, "expected": row, "actual": actual}
                records.append(result)
                stream.write(json.dumps(result, ensure_ascii=False) + "\n")
                stream.flush()
                print(name, row["id"], actual.get("decision"), flush=True)
    write_json(
        output / "summary.json",
        {
            name: {
                "correct_status": sum(
                    r["actual"]["decision"]["status"] == r["expected"]["status"]
                    for r in records
                    if r["variant"] == name
                ),
                "unsafe_previews": sum(
                    r["actual"]["validated"]["status"] == "preview"
                    and r["expected"]["status"] == "clarify"
                    for r in records
                    if r["variant"] == name
                ),
            }
            for name in ("schema", "branch", "escaped_branch")
        },
    )


if __name__ == "__main__":
    main()
