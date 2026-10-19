"""Verify the compact transport cannot bypass accounting boundaries."""

import unittest

from array_last import ArrayLastContract
from compact import CompactContract, contract
from counting import CountContract
from lean import LeanContract
from semantic import SemanticContract


class CompactTests(unittest.TestCase):
    def setUp(self):
        self.text = "\u5fae\u4fe1\u4ed8\u996d\u94b145\u5143"
        self.context = contract.default_context()
        self.mapping = CompactContract(self.text, self.context)

    def test_complete_preview(self):
        decision = self.mapping.decode("[1,0,1,1,2,0,0]")
        result = contract.validate_business(decision, self.text, self.context)
        self.assertEqual(result["amount_cents"], 4500)
        self.assertEqual(result["status"], "preview")

    def test_abstention_is_not_a_transaction(self):
        decision = self.mapping.decode("[0]")
        self.assertIsNone(decision["amount"])
        self.assertNotEqual(
            contract.validate_business(decision, self.text, self.context)["status"],
            "preview",
        )

    def test_invalid_indices_and_shapes(self):
        for response in (
            "[1,0,-1,1,2,0,0]",
            "[1,0,1,999,2,0,0]",
            "[true]",
            "[1]",
            "[0,0]",
            "[1,9,1,1,2,0,0]",
        ):
            with self.subTest(response=response), self.assertRaises(ValueError):
                self.mapping.decode(response)

    def test_unmentioned_account_rejected(self):
        with self.assertRaises(ValueError):
            self.mapping.decode("[1,0,1,1,1,0,0]")

    def test_missing_account_stays_partial(self):
        decision = self.mapping.decode("[1,0,1,1,0,0,0]")
        self.assertEqual(
            contract.validate_business(decision, self.text, self.context)["status"],
            "needs_input",
        )

    def test_category_type_mismatch_stays_invalid(self):
        decision = self.mapping.decode("[1,0,1,16,2,0,0]")
        self.assertEqual(
            contract.validate_business(decision, self.text, self.context)["status"],
            "invalid",
        )

    def test_semantic_values_preserve_evidence(self):
        mapping = SemanticContract(self.text, self.context)
        decision = mapping.decode(
            '["single","expense","m0","food","wechat",null,"today"]'
        )
        result = contract.validate_business(decision, self.text, self.context)
        self.assertEqual(result["amount_cents"], 4500)
        self.assertEqual(result["note"], self.text)

    def test_semantic_unknown_id_is_rejected(self):
        mapping = SemanticContract(self.text, self.context)
        with self.assertRaises(ValueError):
            mapping.decode('["single","expense","m0","invented","wechat",null,"today"]')

    def test_semantic_clarify_carries_no_amount(self):
        decision = SemanticContract(self.text, self.context).decode('["clarify"]')
        self.assertIsNone(decision["amount"])
        self.assertEqual(decision["status"], "clarify")

    def test_lean_protocol_keeps_exact_money_and_relative_date(self):
        text = "\u6628\u5929" + self.text
        decision = LeanContract(text, self.context).decode(
            '{"type":"expense","amount":"m0","category":"food",'
            '"account":"wechat","to_account":null,"status":"single"}'
        )
        self.assertEqual(decision["day"], "yesterday")
        self.assertEqual(
            contract.validate_business(decision, text, self.context)["amount_cents"],
            4500,
        )

    def test_lean_protocol_rejects_extra_fields(self):
        with self.assertRaises(ValueError):
            LeanContract(self.text, self.context).decode(
                '{"type":"expense","amount":"m0","category":"food",'
                '"account":"wechat","to_account":null,"status":"single","day":"today"}'
            )

    def test_lean_protocol_leaves_unsupported_dates_for_confirmation(self):
        decision = LeanContract("2026/01/01 " + self.text, self.context).decode(
            '{"type":"expense","amount":null,"category":"food",'
            '"account":"wechat","to_account":null,"status":"single"}'
        )
        self.assertEqual(decision["day"], "unknown")

    def test_transaction_count_cannot_authorize_multiple_transactions(self):
        mapping = CountContract(self.text, self.context)
        decision = mapping.decode(
            '{"type":"expense","amount":"m0","category":"food",'
            '"account":"wechat","to_account":null,"count":2}'
        )
        self.assertEqual(decision["status"], "clarify")
        self.assertEqual(
            contract.validate_business(decision, self.text, self.context)["status"],
            "needs_input",
        )

    def test_count_rejects_boolean(self):
        with self.assertRaises(ValueError):
            CountContract(self.text, self.context).decode(
                '{"type":"expense","amount":"m0","category":"food",'
                '"account":"wechat","to_account":null,"count":true}'
            )

    def test_late_array_preserves_named_field_contract(self):
        decision = ArrayLastContract(self.text, self.context).decode(
            '["expense","m0","food","wechat",null,"single"]'
        )
        self.assertEqual(decision["status"], "single")
        self.assertEqual(decision["account"], "wechat")
        with self.assertRaises(ValueError):
            ArrayLastContract(self.text, self.context).decode('["single"]')


if __name__ == "__main__":
    unittest.main()
