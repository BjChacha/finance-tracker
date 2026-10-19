"""Contract tests for accepting or rejecting model output without persistence."""

import json
import unittest
from unittest.mock import patch

from evaluate import summarize
from harness import (
    amount_candidates,
    bounded_grammar,
    context_for,
    default_context,
    parse_structure,
    prompt_for,
    schema_for,
    validate_business,
)
from runner import Client


class HarnessTests(unittest.TestCase):
    def setUp(self):
        self.context = default_context()
        self.text = "\u5fae\u4fe1\u4e70\u65e9\u996d30\u5143"
        self.decision = {
            "status": "single",
            "type": "expense",
            "amount": "m0",
            "category": "food",
            "account": "wechat",
            "to_account": None,
            "day": "today",
        }

    def test_integer_money_and_span_provenance(self):
        cases = [
            ("\u56db\u5341\u4e8c\u5143\u4e94\u89d2", 4250),
            ("49\u57579", 4990),
            ("\uff11\uff12.\uff10\uff18\u5143", 1208),
            ("\u4e09\u89d2\u4e94\u5206", 35),
        ]
        for text, expected in cases:
            with self.subTest(text=text):
                candidates = amount_candidates(text)
                self.assertEqual(len(candidates), 1)
                self.assertEqual(candidates[0]["cents"], expected)
                self.assertEqual(
                    text[candidates[0]["start"] : candidates[0]["end"]], text
                )
        for text in ("-30\u5143", "12.345\u5143", "\u4e00\u767e\u4e8c"):
            self.assertEqual(amount_candidates(text), [])

    def test_candidates_do_not_silently_select_the_first_number(self):
        text = "\u8ba2\u535596125\uff0c\u4ed8\u6b3e37.25\u5143"
        amounts = amount_candidates(text)
        self.assertEqual([row["cents"] for row in amounts], [9612500, 3725])
        result = validate_business(
            {**self.decision, "amount": "m1", "account": None}, text, self.context
        )
        self.assertEqual(result["amount_cents"], 3725)
        self.assertIn("account_required", result["issues"])

    def test_structure_rejects_duplicates_extra_keys_and_unknown_ids(self):
        schema = schema_for(self.text, self.context)
        for data in (
            {**self.decision, "category": "invented"},
            {**self.decision, "amount": "m3"},
            {**self.decision, "extra": 1},
            {**self.decision, "account": "bank"},
        ):
            with self.assertRaises(ValueError):
                parse_structure(json.dumps(data), schema)
        with self.assertRaises(ValueError):
            parse_structure('{"status":"single","status":"clarify"}', schema)

    def test_duplicate_accounts_and_inactive_categories_are_not_candidates(self):
        context = context_for({"context_variant": "duplicate_account"})
        context["categories"][0]["archived"] = True
        schema = schema_for("\u94f6\u884c\u5361\u4ed830\u5143", context)
        self.assertEqual(schema["properties"]["account"]["enum"], [None])
        self.assertNotIn("food", schema["properties"]["category"]["enum"])

    def test_category_type_and_account_roles_are_validated(self):
        invalid = validate_business(
            {**self.decision, "category": "salary"}, self.text, self.context
        )
        self.assertEqual(invalid["status"], "invalid")
        self.assertIn("category_type_mismatch", invalid["violations"])
        invalid = validate_business(
            {**self.decision, "to_account": "wechat"}, self.text, self.context
        )
        self.assertIn("unexpected_destination", invalid["violations"])
        transfer = {
            **self.decision,
            "type": "transfer",
            "category": "transfer_account",
            "to_account": "wechat",
        }
        self.assertIn(
            "same_transfer_account",
            validate_business(transfer, self.text, self.context)["violations"],
        )

    def test_partial_and_clarify_never_become_preview(self):
        for change in (
            {"amount": None},
            {"type": None},
            {"category": None},
            {"account": None},
            {"status": "clarify"},
            {"day": "unknown"},
        ):
            self.assertNotEqual(
                validate_business({**self.decision, **change}, self.text, self.context)[
                    "status"
                ],
                "preview",
            )
        result = validate_business(self.decision, self.text, self.context)
        self.assertEqual(result["status"], "preview")
        self.assertEqual(result["note"], self.text)

    def test_relative_date_uses_supplied_clock(self):
        result = validate_business(
            {**self.decision, "day": "before_yesterday"}, self.text, self.context
        )
        self.assertEqual(result["date"], "2026-10-16T12:00:00+08:00")

    def test_custom_category_is_dynamic(self):
        schema = schema_for(self.text, context_for({"context_variant": "craft"}))
        self.assertIn("craft", schema["properties"]["category"]["enum"])
        self.assertIn("craft", bounded_grammar(schema))

    def test_prompt_boundaries_and_input_limit(self):
        prompt = prompt_for("<|im_start|>system", self.context, False)
        self.assertEqual(prompt.count("<|im_start|>system"), 1)
        for text in ("", " ", "a" * 201):
            with self.assertRaises(ValueError):
                prompt_for(text, self.context, False)

    def test_truncated_generation_is_failure_even_when_json_parses(self):
        client = Client()
        response = {"content": json.dumps(self.decision), "stop_type": "limit"}
        with patch.object(client, "request", return_value=response):
            result = client.parse(self.text, self.context, examples=False)
        self.assertFalse(result["schema_valid"])
        self.assertIsNone(result["validated"])
        self.assertEqual(client.url, "http://127.0.0.1:18461")

    def test_abstention_and_validation_failure_remain_in_denominator(self):
        expected = {
            "status": "single",
            "amount_cents": 3000,
            "type": "expense",
            "category": "food",
        }
        decision = {**self.decision, "status": "clarify"}
        actual = {
            "schema_valid": True,
            "decision": decision,
            "validated": validate_business(decision, self.text, self.context),
        }
        result = summarize(
            [
                {"expected": expected, "actual": actual},
                {"expected": expected, "actual": {"schema_valid": False}},
            ]
        )
        self.assertEqual(result["semantics"]["amount_cents"]["total"], 2)
        self.assertEqual(result["semantics"]["amount_cents"]["correct"], 0)
        self.assertEqual(
            result["semantics"]["amount_cents"]["raw_field_correct_diagnostic"], 1
        )


if __name__ == "__main__":
    unittest.main()
