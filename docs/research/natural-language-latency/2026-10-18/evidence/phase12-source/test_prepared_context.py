"""Context readiness follows model inputs rather than wall-clock changes."""

import copy
import unittest

from backend import contract
from evaluate_prepared import context_key


class PreparedContextTests(unittest.TestCase):
    def test_clock_change_does_not_invalidate_static_context(self):
        context = contract.default_context()
        later = {**context, "now": "2026-10-19T12:00:00+08:00"}
        self.assertEqual(context_key(context), context_key(later))

    def test_active_category_and_account_changes_invalidate_context(self):
        original = contract.default_context()
        for field in ("categories", "accounts"):
            changed = copy.deepcopy(original)
            changed[field][0]["name"] += " Updated"
            self.assertNotEqual(context_key(original), context_key(changed))


if __name__ == "__main__":
    unittest.main()
