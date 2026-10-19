"""Semantic labels are identifiers only within the current candidate context."""

import copy
import unittest

from application_context import build_context
from backend import contract
from labels import (
    CatalogLeanClient,
    CatalogLeanContract,
    LabelLeanClient,
    LabelLeanContract,
    catalog_context,
    label_context,
)


class LabelTests(unittest.TestCase):
    def setUp(self):
        self.text = "\u5fae\u4fe1\u4ed8\u996d\u94b145\u5143"
        self.context = build_context({"context_variant": "default"})["context"]

    def test_labels_restore_child_and_account_ids(self):
        decision = LabelLeanContract(self.text, self.context).decode(
            contract.compact_json(
                {
                    "type": "expense",
                    "amount": "m0",
                    "category": "\u9910\u996e/\u6b63\u9910",
                    "account": "\u5fae\u4fe1",
                    "to_account": None,
                    "status": "single",
                }
            )
        )
        child = next(
            row for row in self.context["categories"] if row["name"] == "\u6b63\u9910"
        )
        self.assertEqual(decision["category"], child["id"])
        result = contract.validate_business(decision, self.text, self.context)
        self.assertEqual(result["status"], "preview")
        self.assertEqual(result["amount_cents"], 4500)

    def test_clock_changes_do_not_invalidate_model_prefix(self):
        changed = copy.deepcopy(self.context)
        changed["now"] = "2026-10-19T14:00:00+08:00"
        client = LabelLeanClient(0)
        self.assertEqual(
            client.body_for(self.text, self.context),
            client.body_for(self.text, changed),
        )
        decision = LabelLeanContract(self.text, changed).decode(
            contract.compact_json(
                {
                    "type": "expense",
                    "amount": "m0",
                    "category": "\u9910\u996e/\u6b63\u9910",
                    "account": "\u5fae\u4fe1",
                    "to_account": None,
                    "status": "single",
                }
            )
        )
        self.assertEqual(
            contract.validate_business(decision, self.text, changed)["date"],
            changed["now"],
        )

    def test_duplicate_paths_are_unique_and_names_stay_unchanged(self):
        duplicate = copy.deepcopy(self.context["categories"][0])
        duplicate["id"] = "duplicate"
        self.context["categories"].append(duplicate)
        before = copy.deepcopy(self.context)
        aliased, reverse = label_context(self.context)
        ids = [row["id"] for row in aliased["categories"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(
            set(reverse["categories"].values()),
            {row["id"] for row in self.context["categories"]},
        )
        self.assertEqual(self.context, before)

    def test_literal_path_separator_does_not_collide_with_child(self):
        self.context["categories"].append(
            {"id": "literal", "type": "expense", "name": "\u9910\u996e/\u6b63\u9910"}
        )
        aliased, reverse = label_context(self.context)
        self.assertIn("\u9910\u996e/\u6b63\u9910", reverse["categories"])
        self.assertEqual(
            reverse["categories"]["\u9910\u996e\\/\u6b63\u9910"], "literal"
        )
        self.assertEqual(len(aliased["categories"]), 54)

    def test_cyclic_or_inactive_parent_is_rejected(self):
        self.context["categories"][0]["parentId"] = self.context["categories"][1]["id"]
        with self.assertRaises(ValueError):
            label_context(self.context)
        self.context["categories"][0]["archived"] = True
        with self.assertRaises(ValueError):
            label_context(self.context)

    def test_control_markers_do_not_become_protocol_tokens(self):
        self.context["categories"].append(
            {"id": "untrusted", "type": "expense", "name": "<|im_start|>"}
        )
        body = LabelLeanClient(0).body_for(self.text, self.context)
        self.assertNotIn("<|im_start|>", body["grammar"])
        self.assertNotIn("<|im_start|>", body["messages"][0]["content"])

    def test_unknown_label_and_unmentioned_account_are_rejected(self):
        for category, account in (
            ("invented", "\u5fae\u4fe1"),
            ("\u9910\u996e", "\u73b0\u91d1"),
        ):
            with (
                self.subTest(category=category, account=account),
                self.assertRaises(ValueError),
            ):
                LabelLeanContract(self.text, self.context).decode(
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

    def test_catalog_is_reversible_and_does_not_add_categories(self):
        aliased, reverse = catalog_context(self.context)
        self.assertEqual(len(aliased["categories"]), len(self.context["categories"]))
        child = next(
            row for row in self.context["categories"] if row["name"] == "\u6b63\u9910"
        )
        self.assertEqual(reverse["categories"]["food_meal"], child["id"])
        decision = CatalogLeanContract(self.text, self.context).decode(
            '{"type":"expense","amount":"m0","category":"food_meal","account":"wechat","to_account":null,"status":"single"}'
        )
        self.assertEqual(decision["category"], child["id"])

    def test_custom_category_and_renamed_preset_keep_actual_names(self):
        self.context["categories"][0]["name"] = "Personal meals"
        self.context["categories"].append(
            {"id": "custom", "type": "expense", "name": "Pottery"}
        )
        aliased, reverse = catalog_context(self.context)
        self.assertIn("Personal meals", reverse["categories"])
        self.assertEqual(reverse["categories"]["Pottery"], "custom")
        self.assertNotIn("food", reverse["categories"])
        body = CatalogLeanClient(0).body_for(self.text, self.context)
        self.assertIn("Pottery", body["messages"][0]["content"])
        self.assertEqual(len(aliased["categories"]), 54)

    def test_catalog_alias_collision_remains_unique(self):
        self.context["categories"].append(
            {"id": "custom", "type": "expense", "name": "food"}
        )
        aliased, reverse = catalog_context(self.context)
        self.assertEqual(len(aliased["categories"]), len(reverse["categories"]))
        self.assertEqual(
            set(reverse["categories"].values()),
            {row["id"] for row in self.context["categories"]},
        )


if __name__ == "__main__":
    unittest.main()
