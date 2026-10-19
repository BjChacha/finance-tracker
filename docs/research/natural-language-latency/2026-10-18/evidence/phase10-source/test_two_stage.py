"""Keep gate failures, abstentions and extraction decisions fail-closed."""

import unittest
from unittest.mock import Mock

from backend import contract
from semantic_gate import SemanticGateClient
from two_stage import SparseAccountsContract, TwoStageClient


class TwoStageTests(unittest.TestCase):
    def setUp(self):
        self.text = "\u5fae\u4fe1\u4ed8\u996d\u94b145\u5143"
        self.context = contract.default_context()
        self.client = TwoStageClient(0)

    def gate_result(self, status, valid=True):
        return {
            "schema_valid": valid,
            "status": status,
            "response": status,
            "request": {},
            "elapsed_ms": 5,
        }

    def test_clarify_never_calls_extraction(self):
        self.client.gate.parse = Mock(return_value=self.gate_result("clarify"))
        self.client.fields.parse = Mock()
        result = self.client.parse(self.text, self.context)
        self.client.fields.parse.assert_not_called()
        self.assertEqual(result["decision"]["status"], "clarify")
        self.assertEqual(result["validated"]["status"], "needs_input")
        self.assertIsNone(result["decision"]["amount"])

    def test_gate_error_never_calls_extraction(self):
        self.client.gate.parse = Mock(return_value=self.gate_result(None, valid=False))
        self.client.fields.parse = Mock()
        result = self.client.parse(self.text, self.context)
        self.client.fields.parse.assert_not_called()
        self.assertFalse(result["schema_valid"])
        self.assertIsNone(result["decision"])

    def test_unknown_gate_label_is_not_authorization(self):
        self.client.gate.parse = Mock(return_value=self.gate_result("unexpected"))
        self.client.fields.parse = Mock()
        result = self.client.parse(self.text, self.context)
        self.client.fields.parse.assert_not_called()
        self.assertFalse(result["schema_valid"])

    def test_gate_single_does_not_override_extraction_abstention(self):
        self.client.gate.parse = Mock(return_value=self.gate_result("single"))
        extraction = {
            "schema_valid": True,
            "decision": {"status": "clarify"},
            "validated": {"status": "needs_input"},
            "elapsed_ms": 10,
        }
        self.client.fields.parse = Mock(return_value=extraction)
        result = self.client.parse(self.text, self.context)
        self.assertEqual(result["decision"]["status"], "clarify")
        self.assertEqual(result["extraction_elapsed_ms"], 10)
        self.assertTrue(result["extraction_performed"])
        self.assertNotIn("gate", extraction)

    def test_extraction_failure_is_preserved(self):
        self.client.gate.parse = Mock(return_value=self.gate_result("single"))
        self.client.fields.parse = Mock(
            return_value={
                "schema_valid": False,
                "decision": None,
                "validated": None,
                "elapsed_ms": 10,
                "error": "Invalid output",
            }
        )
        result = self.client.parse(self.text, self.context)
        self.assertFalse(result["schema_valid"])
        self.assertEqual(result["error"], "Invalid output")

    def test_prompt_caches_use_distinct_slots(self):
        gate = self.client.gate.body_for(self.text, self.context)
        fields = self.client.fields.body_for(self.text, self.context)
        self.assertEqual(gate["id_slot"], 0)
        self.assertEqual(fields["id_slot"], 1)
        self.assertIn('"status"', fields["grammar"].replace('\\"', '"'))

    def test_gate_rejects_truncated_output(self):
        client = SemanticGateClient(0)
        client.request = Mock(
            return_value={
                "choices": [
                    {"finish_reason": "length", "message": {"content": "single"}}
                ]
            }
        )
        result = client.parse(self.text, self.context)
        self.assertFalse(result["schema_valid"])
        self.assertIsNone(result["status"])

    def test_sparse_missing_accounts_remain_unknown(self):
        mapping = SparseAccountsContract("\u996d\u94b145\u5143", self.context)
        value = mapping.decode(
            '{"status":"single","type":"expense","amount":"m0","category":"food"}'
        )
        self.assertIsNone(value["account"])
        self.assertIsNone(value["to_account"])
        self.assertEqual(
            contract.validate_business(value, mapping.text, self.context)["status"],
            "needs_input",
        )

    def test_sparse_mentioned_account_cannot_be_omitted(self):
        mapping = SparseAccountsContract(self.text, self.context)
        with self.assertRaises(ValueError):
            mapping.decode(
                '{"status":"single","type":"expense","amount":"m0","category":"food"}'
            )

    def test_sparse_transfer_requires_both_role_fields(self):
        text = "\u5fae\u4fe1\u8f6c\u94f6\u884c\u5361200\u5143"
        mapping = SparseAccountsContract(text, self.context)
        with self.assertRaises(ValueError):
            mapping.decode(
                '{"status":"single","type":"transfer","amount":"m0","category":"transfer_account","account":"wechat"}'
            )
        value = mapping.decode(
            '{"status":"single","type":"transfer","amount":"m0","category":"transfer_account","account":"wechat","to_account":"bank"}'
        )
        self.assertEqual(value["account"], "wechat")
        self.assertEqual(value["to_account"], "bank")

    def test_sparse_rejects_destination_on_expense(self):
        mapping = SparseAccountsContract(self.text, self.context)
        with self.assertRaises(ValueError):
            mapping.decode(
                '{"status":"single","type":"expense","amount":"m0","category":"food","account":"wechat","to_account":"bank"}'
            )

    def test_sparse_rejects_duplicate_status(self):
        mapping = SparseAccountsContract("\u996d\u94b145\u5143", self.context)
        with self.assertRaises(ValueError):
            mapping.decode(
                '{"status":"clarify","status":"single","type":"expense",'
                '"amount":"m0","category":"food"}'
            )


if __name__ == "__main__":
    unittest.main()
