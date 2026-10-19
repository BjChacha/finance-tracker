"""Build synthetic opaque-ID contexts from the application's current seed taxonomy."""

import copy
import re
import uuid

from backend import ROOT, contract, sha256

SEED = ROOT / "src/db/seed.ts"
TRANSFERS = ROOT / "src/db/category-presets.ts"


def opaque_id(kind, original):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"finance-benchmark/{kind}/{original}"))


def seed_categories():
    source = SEED.read_text(encoding="utf-8")
    result = []
    for constant, kind in (
        ("EXPENSE_PRESETS", "expense"),
        ("INCOME_PRESETS", "income"),
    ):
        block = re.search(
            rf"const {constant}: PresetCategory\[\] = \[(.*?)\n\];", source, re.DOTALL
        )
        if not block:
            raise ValueError("Seed fixture extractor needs review after source changes")
        for line in block.group(1).splitlines():
            name = re.search(r"\{ name: '([^']+)'", line)
            if not name:
                continue
            children = re.search(r"children: \[([^]]*)\]", line)
            result.append(
                (
                    kind,
                    name.group(1),
                    re.findall(r"'([^']+)'", children.group(1)) if children else [],
                )
            )
    result.extend(
        ("transfer", name, [])
        for name in re.findall(
            r"name: '([^']+)'", TRANSFERS.read_text(encoding="utf-8")
        )
    )
    if len(result) != 29 or sum(len(children) for _, _, children in result) != 24:
        raise ValueError("Seed taxonomy changed; review the benchmark fixture")
    return result


def build_context(row):
    original = contract.context_for(row)
    by_name = {(item["type"], item["name"]): item for item in original["categories"]}
    categories, category_roots, legacy_ids = [], {}, {}
    for kind, name, children in seed_categories():
        parent = copy.deepcopy(by_name[(kind, name)])
        legacy = parent["id"]
        parent["id"] = opaque_id("category", legacy)
        categories.append(parent)
        category_roots[parent["id"]] = legacy
        legacy_ids[legacy] = parent["id"]
        for child_name in children:
            child_id = opaque_id("category", legacy + "/" + child_name)
            categories.append(
                {
                    "id": child_id,
                    "name": child_name,
                    "type": kind,
                    "parentId": parent["id"],
                }
            )
            category_roots[child_id] = legacy
    for item in original["categories"]:
        if item["id"] not in legacy_ids:
            extra = copy.deepcopy(item)
            extra["id"] = opaque_id("category", item["id"])
            if extra.get("parentId"):
                extra["parentId"] = legacy_ids[extra["parentId"]]
            categories.append(extra)
            category_roots[extra["id"]] = item["id"]
    accounts, account_ids = [], {}
    for item in original["accounts"]:
        account = copy.deepcopy(item)
        account["id"] = opaque_id("account", item["id"])
        accounts.append(account)
        account_ids[account["id"]] = item["id"]
    return {
        "context": {**original, "categories": categories, "accounts": accounts},
        "category_roots": category_roots,
        "account_ids": account_ids,
        "source_hashes": {
            str(p.relative_to(ROOT)): sha256(p) for p in (SEED, TRANSFERS)
        },
        "scope": "Synthetic accounts and IDs; actual seed taxonomy; no user database access",
    }


def scoring_projection(actual, fixture):
    result = {
        key: copy.deepcopy(actual.get(key))
        for key in ("schema_valid", "decision", "validated", "elapsed_ms")
    }
    for field in ("decision", "validated"):
        value = result.get(field)
        if not value:
            continue
        for key, table in (
            ("category", fixture["category_roots"]),
            ("account", fixture["account_ids"]),
            ("to_account", fixture["account_ids"]),
        ):
            if value.get(key) is not None:
                value[key] = table[value[key]]
    return result
