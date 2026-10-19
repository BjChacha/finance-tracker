"""Exercise distribution, source isolation and denominator boundaries."""

import unittest
from copy import deepcopy

from dataset import HERE, build_sets, read_rows, select_by_group, validate_sets
from score import check_records, guard_metrics, row_metrics, summarize


def record(kind, correct=True):
    expected = {
        "status": "single",
        "type": kind,
        "amount_cents": 100,
        "category": "category",
        "account": "source",
        "to_account": "",
        "day": "today",
    }
    decision = {
        "status": "single",
        "account": "source",
        "to_account": None,
        "day": "today",
    }
    validated = {
        "status": "preview",
        "type": kind if correct else "unknown",
        "amount_cents": 100,
        "category": "category",
        "violations": [],
    }
    return {
        "expected": expected,
        "actual": {"schema_valid": True, "decision": decision, "validated": validated},
    }


class DatasetTests(unittest.TestCase):
    def test_generated_files_match_builder(self):
        sets, _ = build_sets()
        for name, rows in sets.items():
            self.assertEqual(rows, read_rows(HERE / "data" / name))

    def test_wrong_type_ratio_is_rejected(self):
        sets, _ = build_sets()
        sets["dev.tsv"][0]["type"] = "income"
        with self.assertRaisesRegex(ValueError, "mixture"):
            validate_sets(sets)

    def test_duplicate_text_is_rejected(self):
        sets, _ = build_sets()
        sets["dev.tsv"][0]["text"] = sets["dev.tsv"][1]["text"]
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            validate_sets(sets)

    def test_scene_overlap_is_rejected(self):
        sets, _ = build_sets()
        sets["dev.tsv"][0]["group"] = sets["regression.tsv"][0]["group"]
        with self.assertRaisesRegex(ValueError, "Cross-split"):
            validate_sets(sets)

    def test_guards_do_not_fill_transaction_quota(self):
        sets, _ = build_sets()
        sets["dev.tsv"][0]["status"] = "clarify"
        with self.assertRaisesRegex(ValueError, "denominator"):
            validate_sets(sets)

    def test_sampling_never_pads_with_duplicates(self):
        with self.assertRaisesRegex(ValueError, "Insufficient"):
            select_by_group([{"id": "a", "group": "a"}], 2)


class ScoringTests(unittest.TestCase):
    def test_weighting_is_distinct_from_macro_and_sample_counts(self):
        rows = [
            record("expense"),
            record("expense"),
            record("income", False),
            record("transfer", False),
        ]
        result = summarize(rows)
        self.assertEqual(result["aggregate"]["empirical"]["raw_type"], 0.5)
        self.assertEqual(result["aggregate"]["target_weighted"]["raw_type"], 0.85)
        self.assertAlmostEqual(result["aggregate"]["macro"]["raw_type"], 1 / 3)
        self.assertEqual(result["single_count"], 4)

    def test_abstention_counts_as_a_miss(self):
        row = record("expense")
        row["actual"]["decision"]["status"] = "clarify"
        row["actual"]["validated"]["status"] = "needs_input"
        metrics = row_metrics(row)
        self.assertEqual(metrics["raw_amount_cents"], 1)
        self.assertEqual(metrics["usable_amount_cents"], 0)
        self.assertEqual(metrics["ready_correct"], 0)

    def test_business_conflict_does_not_count_as_usable(self):
        row = record("transfer")
        row["actual"]["validated"]["violations"] = ["same_transfer_account"]
        self.assertEqual(row_metrics(row)["usable_type"], 0)

    def test_guards_are_separate(self):
        singles = [record(kind) for kind in ("expense", "income", "transfer")]
        guard = deepcopy(singles[0])
        guard["expected"]["status"] = "clarify"
        self.assertEqual(summarize(singles + [guard])["single_count"], 3)
        self.assertEqual(guard_metrics([guard])["unsafe_previews"], 1)
        with self.assertRaises(ValueError):
            row_metrics(guard)

    def test_missing_stratum_cannot_report_weighted_accuracy(self):
        with self.assertRaisesRegex(ValueError, "Missing type"):
            summarize([record("expense")])

    def test_missing_predictions_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            check_records([], [{"id": "one"}])


if __name__ == "__main__":
    unittest.main()
