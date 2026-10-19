"""Exercise dynamic account identity, ambiguity, and explicit role evidence."""

import copy
import unittest

from account_evidence import (
    account_mentions,
    attach_account_audit,
    audit_account_evidence,
)


class AccountEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.context = {
            "accounts": [
                {
                    "id": "a17",
                    "name": "\u5fae\u4fe1",
                    "aliases": ["\u5fae\u4fe1\u4f59\u989d"],
                },
                {"id": "b42", "name": "\u94f6\u884c\u5361"},
            ]
        }

    def audit(self, text, **values):
        return audit_account_evidence(
            text,
            self.context,
            {"type": "transfer", "account": "a17", "to_account": "b42", **values},
        )

    def test_matching_roles(self):
        text = "\u5fae\u4fe1\u4f59\u989d\u63d0\u73b0\u5230\u94f6\u884c\u53611000\u5757"
        self.assertEqual(self.audit(text)["issues"], [])

    def test_reversed_roles_require_confirmation(self):
        text = "\u6211\u7684\u5fae\u4fe1\u8f6c\u5230\u94f6\u884c\u5361\u4e09\u767e\u4e8c\u5341\u5143"
        result = self.audit(text, account="b42", to_account="a17")
        self.assertEqual(result["confirmation_fields"], ["account", "to_account"])
        self.assertEqual(
            {i["code"] for i in result["issues"]}, {"transfer_role_conflict"}
        )

    def test_amount_between_names(self):
        text = "\u4ece\u5fae\u4fe1\u8f6c100\u5230\u94f6\u884c\u5361"
        self.assertEqual(self.audit(text)["issues"], [])
        self.assertTrue(self.audit(text, account="b42")["issues"])

    def test_no_destination_marker(self):
        text = "\u5fae\u4fe1\u8f6c\u94f6\u884c\u5361200"
        self.assertTrue(self.audit(text, account="b42", to_account="a17")["issues"])

    def test_name_order_alone_does_not_assign_roles(self):
        text = "\u94f6\u884c\u5361\u6536\u5230\u5fae\u4fe1\u8f6c\u6765\u7684200"
        self.assertEqual(self.audit(text)["issues"], [])

    def test_null_account_is_not_filled(self):
        result = self.audit(
            "\u5fae\u4fe1\u8f6c\u5230\u94f6\u884c\u5361200", account=None
        )
        self.assertEqual(result["issues"], [])

    def test_alias_collision(self):
        self.context["accounts"].extend(
            [
                {"id": "x", "name": "Personal", "aliases": ["Shared"]},
                {"id": "y", "name": "Business", "aliases": ["Shared"]},
            ]
        )
        result = self.audit(
            "Paid from Shared", type="expense", account="x", to_account=None
        )
        self.assertEqual(result["issues"][0]["code"], "account_alias_ambiguous")
        self.assertEqual(result["mentions"][0]["candidate_ids"], ["x", "y"])

    def test_duplicate_names(self):
        self.context["accounts"].append({"id": "bank2", "name": "\u94f6\u884c\u5361"})
        result = self.audit("\u5fae\u4fe1\u8f6c\u5230\u94f6\u884c\u5361200")
        self.assertEqual(result["confirmation_fields"], ["to_account"])

    def test_specific_name_shadows_short_name(self):
        self.context["accounts"].append(
            {"id": "icbc", "name": "\u5de5\u5546\u94f6\u884c\u5361"}
        )
        text = "\u5de5\u5546\u94f6\u884c\u5361\u4ed8\u4e8630"
        mentions = account_mentions(text, self.context)
        self.assertEqual(mentions[0]["candidate_ids"], ["icbc"])
        self.assertEqual(
            self.audit(text, type="expense", account="icbc", to_account=None)["issues"],
            [],
        )
        self.assertEqual(
            self.audit(text, type="expense", account="b42", to_account=None)["issues"][
                0
            ]["code"],
            "account_evidence_missing",
        )

    def test_inactive_alias_does_not_collide(self):
        self.context["accounts"].append(
            {"id": "inactive", "name": "\u5fae\u4fe1", "active": False}
        )
        self.assertEqual(
            self.audit("\u5fae\u4fe1\u8f6c\u5230\u94f6\u884c\u5361200")["issues"], []
        )

    def test_explicit_uncertainty(self):
        text = "\u5fae\u4fe1\u8f6c\u5230\u94f6\u884c\u5361200\uff0c\u5fd8\u8bb0\u54ea\u5f20"
        result = self.audit(text)
        self.assertEqual(result["confirmation_fields"], ["account", "to_account"])

    def test_forgot_to_record_is_not_account_uncertainty(self):
        text = "\u5fae\u4fe1\u8f6c\u5230\u94f6\u884c\u5361200\uff0c\u5fd8\u8bb0\u8bb0\u8d26"
        self.assertEqual(self.audit(text)["issues"], [])

    def test_original_decision_and_validation_are_preserved(self):
        actual = {
            "decision": {"type": "transfer", "account": "b42", "to_account": "a17"},
            "validated": {"status": "preview", "issues": [], "violations": []},
        }
        saved = copy.deepcopy(actual)
        result = attach_account_audit(
            "\u5fae\u4fe1\u8f6c\u5230\u94f6\u884c\u5361200", self.context, actual
        )
        self.assertEqual(actual, saved)
        self.assertEqual(result["actual"], saved)
        self.assertFalse(result["preview_ready"])

    def test_existing_invalid_result_cannot_be_promoted(self):
        actual = {
            "decision": {"type": "transfer", "account": "a17", "to_account": "b42"},
            "validated": {"status": "invalid"},
        }
        result = attach_account_audit(
            "\u5fae\u4fe1\u8f6c\u5230\u94f6\u884c\u5361200", self.context, actual
        )
        self.assertEqual(result["account_audit"]["issues"], [])
        self.assertFalse(result["preview_ready"])


if __name__ == "__main__":
    unittest.main()
