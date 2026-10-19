"""Amount omission requires semantic approval and retains original span IDs."""

import unittest

from application_context import build_context
from backend import contract
from unique_amount import UniqueAmountClient, UniqueAmountContract


class UniqueAmountTests(unittest.TestCase):
    def setUp(self):
        self.context = build_context({"context_variant": "default"})["context"]

    def test_single_confirms_one_candidate_but_clarify_does_not(self):
        mapping = UniqueAmountContract("\u996d\u94b145\u5143", self.context)
        for status, expected in (("single", "m0"), ("clarify", None)):
            value = mapping.decode(
                contract.compact_json(
                    {"type": "expense", "category": "food", "status": status}
                )
            )
            self.assertEqual(value["amount"], expected)

    def test_quantity_filter_preserves_evidence_id_and_offsets(self):
        text = "\u4e24\u672c\u4e66\u4ed8\u4e86\u4e8c\u5341\u4e09\u5143"
        mapping = UniqueAmountContract(text, self.context)
        self.assertEqual(len(mapping.amounts), 1)
        self.assertEqual(mapping.amounts[0]["id"], "m1")
        self.assertEqual(mapping.amounts[0]["cents"], 2300)
        amount = mapping.amounts[0]
        self.assertEqual(text[amount["start"] : amount["end"]], amount["text"])

    def test_multiple_amounts_still_require_model_selection(self):
        mapping = UniqueAmountContract(
            "\u539f\u4ef7100\u5143\u5b9e\u4ed880\u5143", self.context
        )
        self.assertIn("amount", mapping.fields_for("expense"))
        with self.assertRaises(ValueError):
            mapping.decode('{"type":"expense","category":"food","status":"single"}')
        value = mapping.decode(
            '{"type":"expense","amount":"m1","category":"food","status":"single"}'
        )
        self.assertEqual(value["amount"], "m1")

    def test_money_markers_and_bare_money_are_not_quantity_counts(self):
        for text in ("\u4ed8\u4e8620", "\u4ed8\u4e8620\u5143\u4e2a\u4eba\u8d26\u6237"):
            with self.subTest(text=text):
                mapping = UniqueAmountContract(text, self.context)
                self.assertEqual(len(mapping.amounts), 1)
                self.assertFalse(mapping.quantity_candidates)

    def test_no_candidate_cannot_derive_an_amount(self):
        mapping = UniqueAmountContract("\u4e70\u4e86\u4e24\u672c\u4e66", self.context)
        self.assertFalse(mapping.amounts)
        self.assertIn("amount", mapping.fields_for("expense"))
        with self.assertRaises(ValueError):
            mapping.decode(
                '{"type":"expense","amount":"m0","category":"food","status":"single"}'
            )

    def test_prompt_and_grammar_agree_on_filtered_candidates(self):
        text = "\u4e24\u672c\u4e66\u4ed8\u4e8623\u5143"
        client = UniqueAmountClient(0)
        body = client.body_for(text, self.context)
        self.assertNotIn('\\"amount\\"', body["grammar"])
        self.assertNotIn('"id":"m0"', body["messages"][1]["content"])
        self.assertIn('"id":"m1"', body["messages"][1]["content"])


if __name__ == "__main__":
    unittest.main()
