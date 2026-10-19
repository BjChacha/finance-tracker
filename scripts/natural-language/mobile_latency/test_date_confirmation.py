"""Unknown calendar references must not become an unreviewed current date."""

import copy
import unittest

from date_confirmation import confirm_unsupported_date


class DateConfirmationTests(unittest.TestCase):
    def setUp(self):
        self.actual = {
            "schema_valid": True,
            "decision": {"status": "single", "type": "expense", "day": "today"},
            "validated": {"status": "preview", "date": "2026-10-18", "issues": []},
        }

    def test_weekend_requires_date_without_changing_raw_decision(self):
        text = "\u5468\u672b\u65c5\u884c\u7684\u9152\u5e97\u5c3e\u6b3e\u5b9e\u4ed8260\u5143"
        saved = copy.deepcopy(self.actual)
        result = confirm_unsupported_date(text, self.actual)
        self.assertIsNone(result["validated"]["date"])
        self.assertEqual(result["validated"]["status"], "needs_input")
        self.assertEqual(result["decision"], saved["decision"])
        self.assertEqual(self.actual, saved)
        evidence = result["date_review"]["evidence"][0]
        self.assertEqual(text[evidence["start"] : evidence["end"]], evidence["text"])

    def test_weekday_and_year_month_references_require_review(self):
        for hint in (
            "\u5468\u4e00",
            "\u661f\u671f\u5929",
            "\u793c\u62dc\u4e09",
            "\u6708\u5e95",
            "\u53bb\u5e74",
        ):
            with self.subTest(hint=hint):
                result = confirm_unsupported_date(hint + " 20", self.actual)
                self.assertIn("date_review", result)

    def test_supported_days_and_absent_time_are_unchanged(self):
        for text in (
            "\u4eca\u5929\u5403\u996d20",
            "\u6628\u5929\u5403\u996d20",
            "\u524d\u5929\u5403\u996d20",
            "\u5403\u996d20",
            "\u5468\u8f6c\u8d44\u91d120",
        ):
            with self.subTest(text=text):
                self.assertEqual(
                    confirm_unsupported_date(text, self.actual), self.actual
                )

    def test_calendar_reference_even_with_today_does_not_guess_its_role(self):
        result = confirm_unsupported_date(
            "\u4eca\u5929\u4ed8\u5468\u672b\u9152\u5e97\u8d3940", self.actual
        )
        self.assertTrue(result["date_review"]["required"])

    def test_invalid_or_clarify_is_never_promoted(self):
        self.actual["validated"]["status"] = "invalid"
        result = confirm_unsupported_date("\u5468\u672b", self.actual)
        self.assertEqual(result["validated"]["status"], "invalid")
        self.actual["decision"]["status"] = "clarify"
        self.assertEqual(
            confirm_unsupported_date("\u5468\u672b", self.actual), self.actual
        )


if __name__ == "__main__":
    unittest.main()
