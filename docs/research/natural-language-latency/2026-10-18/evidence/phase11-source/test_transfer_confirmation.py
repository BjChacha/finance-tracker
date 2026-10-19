"""Unsupported transfer descriptions remain user decisions, never auto-repairs."""

import copy
import unittest

from backend import contract
from transfer_confirmation import confirm_transfer_direction


class TransferConfirmationTests(unittest.TestCase):
    def setUp(self):
        self.context = contract.default_context()

    def result(self, text, account="wechat", destination="bank"):
        decision = {
            "type": "transfer",
            "amount": "m0",
            "category": "transfer_account",
            "account": account,
            "to_account": destination,
            "status": "single",
            "day": "today",
        }
        return {
            "schema_valid": True,
            "decision": decision,
            "validated": contract.validate_business(decision, text, self.context),
        }

    def test_supported_explicit_direction_can_remain_ready(self):
        text = "\u5fae\u4fe1\u8f6c\u5230\u94f6\u884c\u5361200\u5143"
        value = confirm_transfer_direction(text, self.context, self.result(text))
        self.assertFalse(value["transfer_direction_review"]["required"])
        self.assertEqual(value["validated"]["status"], "preview")

    def test_unsupported_direction_requires_review_without_repair(self):
        text = "\u94f6\u884c\u5361\u6536\u5230\u6211\u5fae\u4fe1\u8f6c\u6765\u7684200\u5143"
        actual = self.result(text, account="bank", destination="wechat")
        saved = copy.deepcopy(actual)
        value = confirm_transfer_direction(text, self.context, actual)
        self.assertTrue(value["transfer_direction_review"]["required"])
        self.assertEqual(value["validated"]["status"], "needs_input")
        self.assertEqual(value["decision"], saved["decision"])
        self.assertEqual(actual, saved)

    def test_missing_role_does_not_certify_the_other_role(self):
        text = "\u94f6\u884c\u5361\u53d6\u51fa\u73b0\u91d1200\u5143"
        value = confirm_transfer_direction(
            text, self.context, self.result(text, "bank", None)
        )
        self.assertIn(
            "account_direction_confirmation_required", value["validated"]["issues"]
        )
        self.assertIn(
            "to_account_direction_confirmation_required", value["validated"]["issues"]
        )

    def test_existing_invalid_result_is_not_promoted(self):
        text = "\u5fae\u4fe1\u8f6c\u5230\u94f6\u884c\u5361200\u5143"
        value = confirm_transfer_direction(
            text, self.context, self.result(text, "bank", "bank")
        )
        self.assertEqual(value["validated"]["status"], "invalid")

    def test_nontransfer_is_unchanged(self):
        actual = {
            "schema_valid": True,
            "decision": {"status": "single", "type": "expense"},
        }
        self.assertEqual(
            confirm_transfer_direction("Lunch 20", self.context, actual), actual
        )


if __name__ == "__main__":
    unittest.main()
