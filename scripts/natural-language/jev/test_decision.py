"""Test contract boundaries without model downloads or semantic assumptions."""

import copy
import unittest

from decision import DecisionParser
from support import BackendError, PromptConfig, compile_request
from support import baseline_harness as contract


class FixedParser(DecisionParser):
    def __init__(self, choices):
        super().__init__(None)
        self.selected = choices
        self.observed = {}

    def choices(self, text, questions):
        self.observed.update(questions)
        return {
            name: {"choice": self.selected.get(name, "unknown")} for name in questions
        }


class BoundaryTests(unittest.TestCase):
    def setUp(self):
        self.context = contract.default_context()
        self.text = "\u5fae\u4fe1\u4ed8\u65e9\u9910\u4e09\u5341\u5757"

    def test_integer_amount_and_existing_category(self):
        parser = FixedParser(
            {
                "status": "single",
                "type": "expense",
                "amount": "m0",
                "category": "food",
                "account": "wechat",
                "day": "today",
            }
        )
        actual = parser.parse(self.text, self.context)
        self.assertEqual(actual["validated"]["amount_cents"], 3000)
        self.assertEqual(actual["validated"]["status"], "preview")
        self.assertIsNone(actual["decision"]["to_account"])
        self.assertNotIn("salary", parser.observed["category"]["criteria"])

    def test_unknown_does_not_inherit_defaults(self):
        actual = FixedParser({"status": "conflict", "day": "unknown"}).parse(
            self.text, self.context
        )
        self.assertIsNone(actual["validated"]["amount_cents"])
        self.assertEqual(actual["decision"]["status"], "clarify")
        self.assertIn("type_required", actual["validated"]["issues"])

    def test_duplicate_and_inactive_accounts_not_candidates(self):
        context = copy.deepcopy(self.context)
        context["accounts"].append(
            {"id": "duplicate", "name": "\u5fae\u4fe1", "active": True}
        )
        parser = FixedParser(
            {
                "status": "single",
                "type": "expense",
                "amount": "m0",
                "category": "food",
                "day": "today",
            }
        )
        actual = parser.parse(self.text, context)
        self.assertNotIn("account", parser.observed)
        self.assertIsNone(actual["decision"]["account"])
        context["accounts"][-1]["active"] = False
        context["accounts"][1]["active"] = False
        self.assertEqual(contract.mentioned_accounts(self.text, context), [])

    def test_custom_category_comes_from_context(self):
        context = contract.context_for({"context_variant": "craft"})
        parser = FixedParser(
            {
                "status": "single",
                "type": "expense",
                "amount": "m0",
                "category": "craft",
                "account": "wechat",
                "day": "today",
            }
        )
        actual = parser.parse(self.text, context)
        self.assertIn("craft", parser.observed["category"]["criteria"])
        self.assertEqual(actual["validated"]["category"], "craft")

    def test_same_transfer_account_rejected(self):
        parser = FixedParser(
            {
                "status": "single",
                "type": "transfer",
                "amount": "m0",
                "category": "transfer_account",
                "account": "wechat",
                "to_account": "wechat",
                "day": "today",
            }
        )
        actual = parser.parse(self.text, self.context)
        self.assertIn("same_transfer_account", actual["validated"]["violations"])

    def test_official_compiler_keeps_choice_mapping(self):
        plans = compile_request(
            {
                "state": "input",
                "questions": {
                    "field": {
                        "type": "choice",
                        "instructions": "choose",
                        "criteria": {"id": "description"},
                    }
                },
            },
            PromptConfig(),
        )
        self.assertEqual(plans[0].inputs[1].text, "id: description")
        self.assertEqual(plans[0].labels, ["id"])

    def test_rejects_out_of_contract_input(self):
        parser = FixedParser({})
        for text in ("", " " * 3, "a" * 201):
            with self.assertRaises(ValueError):
                parser.parse(text, self.context)

    def test_document_cache_does_not_cache_queries(self):
        class RecordingEncoder:
            def __init__(self):
                self.calls = []

            def encode(self, texts):
                self.calls.append(list(texts))
                return [[1.0] + [0.0] * 1023 for _ in texts]

        encoder = RecordingEncoder()
        parser = DecisionParser(encoder)
        question = {
            "field": parser.question("select", {"one": "first", "two": "second"})
        }
        parser.choices("input", question)
        parser.choices("input", question)
        self.assertEqual(len(encoder.calls[0]), 3)
        self.assertEqual(len(encoder.calls[1]), 1)
        question["field"]["criteria"]["one"] = "changed"
        parser.choices("input", question)
        self.assertEqual(len(encoder.calls[2]), 2)
        fresh = DecisionParser(encoder)
        fresh.choices("input", question)
        self.assertEqual(len(encoder.calls[3]), 3)

    def test_nonfinite_or_wrong_dimension_embeddings_fail_closed(self):
        class BadEncoder:
            def __init__(self, vector):
                self.vector = vector

            def encode(self, texts):
                return [self.vector for _ in texts]

        for vector in ([float("nan")] * 1024, [1.0], [0.0] * 1024):
            with self.subTest(vector_length=len(vector)):
                parser = DecisionParser(BadEncoder(vector))
                with self.assertRaises(BackendError):
                    parser.parse(self.text, self.context)


if __name__ == "__main__":
    unittest.main()
