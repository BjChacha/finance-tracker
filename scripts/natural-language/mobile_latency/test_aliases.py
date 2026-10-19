"""Aliases preserve active IDs, nullable fields, and request-local ownership."""

import copy
import unittest

from aliases import AliasLeanClient, AliasLeanContract, alias_context
from backend import contract


class AliasTests(unittest.TestCase):
    def setUp(self):
        self.text = "\u5fae\u4fe1\u4ed8\u996d\u94b145\u5143"
        self.context = contract.default_context()

    def test_restores_original_identifiers(self):
        value = AliasLeanContract(self.text, self.context).decode(
            '{"type":"expense","amount":"m0","category":"c0",'
            '"account":"a1","to_account":null,"status":"single"}'
        )
        self.assertEqual(value["category"], "food")
        self.assertEqual(value["account"], "wechat")
        self.assertIsNone(value["to_account"])
        self.assertEqual(
            contract.validate_business(value, self.text, self.context)["amount_cents"],
            4500,
        )

    def test_random_database_ids_do_not_change_request(self):
        before = copy.deepcopy(self.context)
        changed = copy.deepcopy(self.context)
        for field in ("categories", "accounts"):
            for index, row in enumerate(changed[field]):
                row["id"] = f"opaque-{field}-{index}"
        client = AliasLeanClient(0)
        self.assertEqual(
            client.body_for(self.text, self.context),
            client.body_for(self.text, changed),
        )
        self.assertEqual(self.context, before)

    def test_unknown_alias_and_unmentioned_account_rejected(self):
        mapping = AliasLeanContract(self.text, self.context)
        for category, account in (("c999", "a1"), ("c0", "a0")):
            with (
                self.subTest(category=category, account=account),
                self.assertRaises(ValueError),
            ):
                mapping.decode(
                    contract.compact_json(
                        {
                            "type": "expense",
                            "amount": "m0",
                            "category": category,
                            "account": account,
                            "to_account": None,
                            "status": "single",
                        }
                    )
                )

    def test_active_parent_is_mapped_without_mutating_input(self):
        self.context["categories"].append(
            {"id": "child", "name": "Child", "type": "expense", "parentId": "food"}
        )
        aliased, reverse = alias_context(self.context)
        child = aliased["categories"][-1]
        self.assertEqual(child["parentId"], "c0")
        self.assertEqual(reverse["categories"][child["id"]], "child")
        self.assertEqual(self.context["categories"][-1]["parentId"], "food")

    def test_inactive_and_duplicate_identifiers_cannot_leak(self):
        self.context["categories"][0]["archived"] = True
        aliased, reverse = alias_context(self.context)
        self.assertNotIn("food", reverse["categories"].values())
        self.assertEqual(len(aliased["categories"]), 28)
        self.context["accounts"][1]["id"] = self.context["accounts"][0]["id"]
        with self.assertRaises(ValueError):
            alias_context(self.context)

    def test_duplicate_output_fields_are_rejected(self):
        with self.assertRaises(ValueError):
            AliasLeanContract(self.text, self.context).decode(
                '{"type":"expense","amount":"m0","category":"c0",'
                '"account":null,"account":"a1","to_account":null,"status":"single"}'
            )


if __name__ == "__main__":
    unittest.main()
