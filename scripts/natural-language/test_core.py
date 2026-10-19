"""Data, accounting precision, decoder and gate invariants."""

import unittest

import numpy as np
from common import HERE, read_json
from corpus import validate_corpus
from metrics import release_gate, summarize
from money import parse_money
from runtime import amount_from, decode_spans, match_account


class Encoding(dict):
    def sequence_ids(self, index):
        return [None, 0, None, 1, 1, None]


class CoreTests(unittest.TestCase):
    def test_money_precision_and_rejection(self):
        for text, expected in read_json(HERE / "data" / "money-tests.json"):
            with self.subTest(text=text):
                self.assertEqual(parse_money(text), expected)

    def test_corpus_split_and_review_status(self):
        corpus = validate_corpus()
        self.assertEqual(corpus["counts"], {"dev": 100, "test": 200})
        self.assertEqual(corpus["review"]["status"], "pending_human_review")

    def test_abstentions_stay_in_denominator(self):
        rows = [
            {
                "expected": {
                    "status": "single",
                    "amount_cents": 3000,
                    "type": "expense",
                    "category": "food",
                },
                "prediction": {},
            }
        ]
        metrics = summarize(rows)
        for field in ("amount_cents", "type", "category"):
            self.assertEqual(metrics[field]["accuracy"], 0)
            self.assertEqual(metrics[field]["abstentions"], 1)
            self.assertFalse(metrics[field]["passed"])

    def test_empty_metrics_and_pending_checks_cannot_pass(self):
        good_mobile = {
            "offline_first_launch": True,
            "warm_p95_ms": 100,
            "cold_p95_ms": 500,
            "extra_peak_pss_mb": 80,
        }
        self.assertFalse(
            release_gate(
                {},
                human_review=True,
                mobile=good_mobile,
                parity=True,
                resource_bytes=50_000_000,
            )["passed"]
        )
        metrics = {
            field: {"passed": True} for field in ("amount_cents", "type", "category")
        }
        self.assertFalse(release_gate(metrics, resource_bytes=50_000_000)["passed"])
        self.assertTrue(
            release_gate(
                metrics,
                human_review=True,
                mobile=good_mobile,
                parity=True,
                resource_bytes=50_000_000,
            )["passed"]
        )
        self.assertFalse(
            release_gate(
                metrics,
                human_review=True,
                mobile={**good_mobile, "extra_peak_pss_mb": -1},
                parity=True,
                resource_bytes=50_000_000,
            )["passed"]
        )

    def test_decoder_keeps_prompt_text_coordinates_separate(self):
        encoded = Encoding(
            offset_mapping=np.array([[(0, 0), (0, 1), (0, 0), (1, 2), (2, 4), (0, 0)]])
        )
        spans = decode_spans(
            encoded, [0, 0.9, 0, 0.8, 0, 0], [0, 0.9, 0, 0, 0.8, 0], "x", "!abc", 0.5
        )
        self.assertEqual(
            [(s["segment"], s["text"]) for s in spans],
            [("prompt", "x"), ("text", "abc")],
        )

    def test_conflicting_amounts_and_duplicate_accounts_abstain(self):
        self.assertIsNone(
            amount_from(
                [{"segment": "text", "text": "30"}, {"segment": "text", "text": "50"}]
            )
        )
        accounts = [{"id": "one", "name": "bank"}, {"id": "two", "name": "bank"}]
        spans = [{"segment": "text", "text": "bank"}]
        self.assertIsNone(match_account(spans, accounts))
        accounts[1]["active"] = False
        self.assertEqual(match_account(spans, accounts), "one")
        self.assertIsNone(
            match_account([{"segment": "text", "text": "unknown"}], accounts)
        )


if __name__ == "__main__":
    unittest.main()
