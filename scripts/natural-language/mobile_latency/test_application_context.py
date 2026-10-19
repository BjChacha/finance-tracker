"""The application fixture preserves hierarchy without rewriting predictions."""

import copy
import unittest

from aliases import alias_context
from application_context import build_context, scoring_projection


class ApplicationContextTests(unittest.TestCase):
    def test_seed_tree_and_aliases_are_consistent(self):
        fixture = build_context({"context_variant": "default"})
        context = fixture["context"]
        self.assertEqual(len(context["categories"]), 53)
        self.assertEqual(
            sum(bool(row.get("parentId")) for row in context["categories"]), 24
        )
        self.assertEqual(len(context["accounts"]), 7)
        aliased, _ = alias_context(context)
        ids = {row["id"] for row in aliased["categories"]}
        self.assertTrue(
            all(
                row.get("parentId") in ids
                for row in aliased["categories"]
                if row.get("parentId")
            )
        )

    def test_scoring_projects_child_without_changing_model_selection(self):
        fixture = build_context({"context_variant": "default"})
        child = fixture["context"]["categories"][1]
        actual = {
            "schema_valid": True,
            "decision": {"category": child["id"]},
            "validated": {"category": child["id"]},
        }
        original = copy.deepcopy(actual)
        projection = scoring_projection(actual, fixture)
        self.assertEqual(projection["validated"]["category"], "food")
        self.assertEqual(actual, original)

    def test_custom_category_and_duplicate_account_survive_fixture(self):
        craft = build_context({"context_variant": "craft"})
        self.assertIn("craft", craft["category_roots"].values())
        duplicate = build_context({"context_variant": "duplicate_account"})
        self.assertEqual(len(duplicate["context"]["accounts"]), 8)
        self.assertEqual(len(set(duplicate["account_ids"])), 8)


if __name__ == "__main__":
    unittest.main()
