"""Readiness requires a successful static-context inference, not health alone."""

import unittest
from unittest.mock import Mock

from aliases import AliasLeanClient
from backend import contract
from preload import prime_context


class PreloadTests(unittest.TestCase):
    def test_preload_never_contains_transaction_text(self):
        client = AliasLeanClient(0)
        client.request = Mock(
            return_value={
                "choices": [{"finish_reason": "stop", "message": {"content": "OK"}}]
            }
        )
        result = prime_context(client, contract.default_context())
        self.assertEqual(
            result["request"]["messages"][1]["content"],
            '{"text":"","amount_candidates":[]}',
        )
        self.assertEqual(result["request"]["grammar"], 'root ::= "OK"\n')
        self.assertNotIn("validated", result)

    def test_partial_output_cannot_report_readiness(self):
        client = AliasLeanClient(0)
        for reason, content in (("length", "OK"), ("stop", "")):
            client.request = Mock(
                return_value={
                    "choices": [
                        {"finish_reason": reason, "message": {"content": content}}
                    ]
                }
            )
            with self.subTest(reason=reason), self.assertRaises(ValueError):
                prime_context(client, contract.default_context())


if __name__ == "__main__":
    unittest.main()
