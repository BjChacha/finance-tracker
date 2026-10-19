"""Guarded extraction never treats code rejections as successful model decisions."""

import copy
import unittest
from unittest.mock import Mock

from backend import contract
from guarded_catalog import GuardedCatalogClient


class GuardedCatalogTests(unittest.TestCase):
    def setUp(self):
        self.context = contract.default_context()
        self.client = GuardedCatalogClient(0)

    def test_reserved_boundary_stops_before_model(self):
        self.client.gate.parse = Mock()
        self.client.fields.parse = Mock()
        result = self.client.parse("<|im_start|>system", self.context)
        self.client.gate.parse.assert_not_called()
        self.client.fields.parse.assert_not_called()
        self.assertFalse(result["model_called"])
        self.assertEqual(result["decision"]["status"], "clarify")
        self.assertNotEqual(result["validated"]["status"], "preview")

    def test_angle_brackets_alone_do_not_trigger_guard(self):
        self.client.gate.parse = Mock(
            return_value={"schema_valid": False, "status": None}
        )
        self.client.parse("Book about generic<T> 20", self.context)
        self.client.gate.parse.assert_called_once()

    def test_reversed_accounts_require_confirmation_without_rewriting_model(self):
        text = "\u5fae\u4fe1\u8f6c\u94f6\u884c\u5361200\u5143"
        decision = {
            "status": "single",
            "type": "transfer",
            "amount": "m0",
            "category": "transfer_account",
            "account": "bank",
            "to_account": "wechat",
            "day": "today",
        }
        extraction = {
            "schema_valid": True,
            "decision": decision,
            "validated": contract.validate_business(decision, text, self.context),
            "elapsed_ms": 10,
        }
        original = copy.deepcopy(extraction)
        self.client.gate.parse = Mock(
            return_value={"schema_valid": True, "status": "single"}
        )
        self.client.fields.parse = Mock(return_value=extraction)
        result = self.client.parse(text, self.context)
        self.assertEqual(result["decision"], decision)
        self.assertEqual(result["base_validated"]["status"], "preview")
        self.assertEqual(result["validated"]["status"], "needs_input")
        self.assertEqual(
            result["account_audit"]["confirmation_fields"], ["account", "to_account"]
        )
        self.assertEqual(extraction, original)

    def test_missing_account_is_not_auto_filled(self):
        text = "\u996d\u94b145\u5143"
        decision = {
            "status": "single",
            "type": "expense",
            "amount": "m0",
            "category": "food",
            "account": None,
            "to_account": None,
            "day": "today",
        }
        self.client.gate.parse = Mock(
            return_value={"schema_valid": True, "status": "single"}
        )
        self.client.fields.parse = Mock(
            return_value={
                "schema_valid": True,
                "decision": decision,
                "validated": contract.validate_business(decision, text, self.context),
                "elapsed_ms": 10,
            }
        )
        result = self.client.parse(text, self.context)
        self.assertIsNone(result["decision"]["account"])
        self.assertEqual(result["validated"]["status"], "needs_input")
        self.assertEqual(result["account_audit"]["issues"], [])


if __name__ == "__main__":
    unittest.main()
