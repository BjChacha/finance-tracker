"""Boundary checks for incomplete previews and dynamic context candidates."""

import unittest

from bridge import contract
from counterfactual import replay
from revision import VariantParser, day_from_evidence, explicit_category


class BoundaryTests(unittest.TestCase):
    def test_default_and_unsupported_dates(self):
        self.assertEqual(day_from_evidence("\u4e70\u83dc30\u5143"), "today")
        self.assertEqual(day_from_evidence("\u6628\u665a\u4e70\u83dc30\u5143"), "yesterday")
        self.assertEqual(day_from_evidence("\u524d\u5929\u4e70\u83dc"), "before_yesterday")
        self.assertEqual(day_from_evidence("\u4e0a\u5468\u4e70\u83dc"), "unknown")
        self.assertEqual(day_from_evidence("\u6628\u5929\u548c\u4eca\u5929\u4e70\u83dc"), "unknown")

    def test_explicit_category_uses_dynamic_unique_names(self):
        context = {"categories": [{"id": "custom-uuid", "name": "Craft", "type": "expense"}]}
        text = "\u8bb0\u5728Craft"
        self.assertEqual(explicit_category(text, context, "expense"), "custom-uuid")
        self.assertIsNone(explicit_category(text, context, "income"))
        self.assertIsNone(explicit_category("Craft", context, "expense"))
        context["categories"].append({"id": "duplicate", "name": "Craft", "type": "expense"})
        self.assertIsNone(explicit_category(text, context, "expense"))

    def test_candidate_rendering_does_not_depend_on_database_id(self):
        parser = VariantParser(None, "compact")
        self.assertEqual(parser.prompt_config.choice_candidate_template, "{text}")
        parser.context = {"categories": [{"id": "opaque-uuid", "name": "Tools", "type": "expense"}]}
        first = parser.category_criteria("expense")["opaque-uuid"]
        parser.context["categories"][0]["id"] = "new-uuid"
        self.assertEqual(first, parser.category_criteria("expense")["new-uuid"])

    def test_repair_preserves_money_but_still_requires_both_accounts(self):
        text = "\u5fae\u4fe1\u8f6c\u94f6\u884c\u536130\u5143"
        decision = {"status": "single", "type": "transfer", "amount": "m0", "category": "transfer_account", "account": "wechat", "to_account": "wechat", "day": "today"}
        validated = contract.validate_business(decision, text, contract.default_context())
        records = [{"expected": {"id": "repair", "text": text}, "actual": {"decision": decision, "validated": validated}}]
        output, changed = replay(records, repair_accounts=True)
        result = output[0]["actual"]["validated"]
        self.assertEqual(changed, ["repair"])
        self.assertEqual(result["amount_cents"], 3000)
        self.assertEqual(result["status"], "needs_input")
        self.assertEqual(result["violations"], [])
        self.assertIn("account_required", result["issues"])
        self.assertIn("destination_required", result["issues"])
        self.assertEqual(records[0]["actual"]["validated"]["status"], "invalid")


if __name__ == "__main__":
    unittest.main()
