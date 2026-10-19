"""Explicit desktop offline integration check; does not claim mobile support."""

import os
import socket
import unittest
from unittest.mock import patch

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

from common import HERE, read_json
from runtime import OfflineCandidate, amount_from


class OfflineTests(unittest.TestCase):
    def test_load_and_custom_category_ranking_without_network(self):
        context = read_json(HERE / "data" / "context.json")
        context["categories"] = [
            {
                "id": "user-created-17",
                "name": "Coffee tasting",
                "type": "expense",
                "examples": ["Coffee beans and cafe visits"],
            },
            {
                "id": "user-created-42",
                "name": "Train rides",
                "type": "expense",
                "examples": ["Rail tickets and transit"],
            },
            {"id": "archived", "name": "Coffee", "type": "expense", "archived": True},
        ]
        with patch.object(
            socket.socket,
            "connect",
            side_effect=AssertionError("Network access attempted"),
        ):
            candidate = OfflineCandidate(context=context)
            rankings = candidate.rank_categories("Coffee tasting", "expense")
            self.assertEqual(rankings[0]["id"], "user-created-17")
            self.assertNotIn("archived", [row["id"] for row in rankings])
            self.assertEqual(candidate.rank_categories("Coffee tasting", "income"), [])
            sample = read_json(HERE / "data" / "parity.json")["uie"][0]
            spans = candidate.extract(
                sample["prompt"], sample["text"], sample["threshold"]
            )
            self.assertEqual(amount_from(spans), 3000)


if __name__ == "__main__":
    unittest.main()
