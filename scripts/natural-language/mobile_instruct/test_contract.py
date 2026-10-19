"""Check rejection boundaries without loading a model or touching application data."""

import json
import unittest

from runtime import Client, contract


class StubClient(Client):
    def __init__(self, response):
        self.response = response

    def request(self, path, body=None, timeout=60):
        self.body = body
        return self.response


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.text = "\u5fae\u4fe1\u4ed8\u996d\u94b145\u5143"
        self.context = contract.default_context()
        self.decision = {
            "type": "expense",
            "amount": "m0",
            "category": "food",
            "account": "wechat",
            "to_account": None,
            "day": "today",
            "status": "single",
        }

    def run_response(self, decision=None, reason="stop", thinking=None):
        client = StubClient(
            {
                "choices": [
                    {
                        "finish_reason": reason,
                        "message": {
                            "content": json.dumps(
                                decision if decision is not None else self.decision
                            ),
                            "reasoning_content": thinking,
                        },
                    }
                ]
            }
        )
        result = client.parse(self.text, self.context)
        return client, result

    def test_valid_preview_uses_integer_cents(self):
        _, result = self.run_response()
        self.assertEqual(result["validated"]["amount_cents"], 4500)
        self.assertEqual(result["validated"]["status"], "preview")

    def test_unknown_id_is_rejected(self):
        _, result = self.run_response({**self.decision, "category": "invented"})
        self.assertFalse(result["schema_valid"])

    def test_wrong_category_type_is_business_error(self):
        _, result = self.run_response({**self.decision, "category": "salary"})
        self.assertEqual(result["validated"]["status"], "invalid")

    def test_incomplete_generation_is_not_a_preview(self):
        _, result = self.run_response(reason="length")
        self.assertFalse(result["schema_valid"])

    def test_unexpected_thinking_is_detected(self):
        _, result = self.run_response(thinking="Unexpected reasoning")
        self.assertFalse(result["schema_valid"])

    def test_missing_account_stays_partial(self):
        _, result = self.run_response({**self.decision, "account": None})
        self.assertEqual(result["validated"]["status"], "needs_input")
        self.assertEqual(result["decision"]["status"], "single")

    def test_self_transfer_cannot_be_saved(self):
        _, result = self.run_response(
            {
                **self.decision,
                "type": "transfer",
                "category": "transfer_account",
                "to_account": "wechat",
            }
        )
        self.assertIn("same_transfer_account", result["validated"]["violations"])

    def test_duplicate_accounts_are_not_forced_into_an_id(self):
        row = {"context_variant": "duplicate_account"}
        context = contract.context_for(row)
        text = "\u94f6\u884c\u5361\u4ed845\u5143"
        schema = contract.schema_for(text, context)
        self.assertEqual(schema["properties"]["account"]["enum"], [None])


if __name__ == "__main__":
    unittest.main()
