"""Expose meaningful candidate paths while preserving request-local ID ownership."""

import json
from collections import Counter

from aliases import AliasLeanClient, AliasLeanContract, alias_context
from backend import HERE, contract


def candidate_paths(field, rows):
    by_id = {row["id"]: row for row in rows}

    def segment(name):
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Candidate names must be nonempty")
        return (
            name.replace("\\", "\\\\")
            .replace("/", "\\/")
            .replace("#", "\\#")
            .replace("<", "\uff1c")
            .replace(">", "\uff1e")
        )

    def path(row):
        names, seen = [], set()
        while True:
            if row["id"] in seen:
                raise ValueError("Cyclic category hierarchy")
            seen.add(row["id"])
            names.append(segment(row["name"]))
            parent = row.get("parentId") if field == "categories" else None
            if parent is None:
                return "/".join(reversed(names))
            if parent not in by_id:
                raise ValueError("Category parent must be active")
            row = by_id[parent]

    return [path(row) for row in rows]


def unique_labels(labels):
    counts = Counter(labels)
    return [
        label if counts[label] == 1 else f"{label}#{i}"
        for i, label in enumerate(labels)
    ]


def candidate_labels(field, rows):
    return unique_labels(candidate_paths(field, rows))


def catalog_labels(field, rows):
    catalog = json.loads((HERE / "semantic_catalog.json").read_text(encoding="utf-8"))
    paths = candidate_paths(field, rows)
    labels = [
        catalog.get(
            ("account" if field == "accounts" else row["type"]) + "/" + path, path
        )
        for row, path in zip(rows, paths, strict=True)
    ]
    return unique_labels(labels)


def label_context(context):
    return alias_context(context, labeler=candidate_labels)


def catalog_context(context):
    return alias_context(context, labeler=catalog_labels)


class LabelLeanContract(AliasLeanContract):
    context_mapper = staticmethod(label_context)


class StableAliasClient(AliasLeanClient):
    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        prefix, metadata = body["messages"][0]["content"].rsplit("\n", 1)
        stable = json.loads(metadata)
        stable.pop("now")
        encoded = (
            contract.compact_json(stable)
            .replace("<", r"\u003c")
            .replace(">", r"\u003e")
        )
        body["messages"][0]["content"] = prefix + "\n" + encoded
        return body


class LabelLeanClient(StableAliasClient):
    contract_type = LabelLeanContract
    context_mapper = staticmethod(label_context)


class CatalogLeanContract(AliasLeanContract):
    context_mapper = staticmethod(catalog_context)


class CatalogLeanClient(StableAliasClient):
    contract_type = CatalogLeanContract
    context_mapper = staticmethod(catalog_context)
