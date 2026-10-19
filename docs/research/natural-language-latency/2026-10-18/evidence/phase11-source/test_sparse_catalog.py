"""Sparse output retains role evidence and restores only forced-null fields."""

import unittest

from application_context import build_context
from backend import contract
from sparse_catalog import SparseCatalogClient, SparseCatalogContract


class SparseCatalogTests(unittest.TestCase):
    def setUp(self):
        self.fixture = build_context({"context_variant": "default"})
        self.context = self.fixture["context"]

    def test_absent_accounts_restore_null_after_id_mapping(self):
        text = "\u996d\u94b145\u5143"
        mapping = SparseCatalogContract(text, self.context)
        value = mapping.decode(
            '{"type":"expense","amount":"m0","category":"food","status":"single"}'
        )
        self.assertEqual(self.fixture["category_roots"][value["category"]], "food")
        self.assertIsNone(value["account"])
        self.assertIsNone(value["to_account"])
        self.assertEqual(
            contract.validate_business(value, text, self.context)["status"],
            "needs_input",
        )
        self.assertEqual(mapping.fields_for("expense")[0], "type")

    def test_mentioned_accounts_and_transfer_roles_cannot_be_omitted(self):
        mapping = SparseCatalogContract(
            "\u5fae\u4fe1\u8f6c\u94f6\u884c\u5361200\u5143", self.context
        )
        prefix = '{"type":"transfer","amount":"m0","category":"transfer_account"'
        with self.assertRaises(ValueError):
            mapping.decode(prefix + ',"status":"single"}')
        value = mapping.decode(
            prefix + ',"account":"wechat","to_account":"bank","status":"single"}'
        )
        self.assertEqual(self.fixture["account_ids"][value["account"]], "wechat")
        self.assertEqual(self.fixture["account_ids"][value["to_account"]], "bank")

    def test_unknown_or_extra_fields_reject(self):
        mapping = SparseCatalogContract("\u996d\u94b145\u5143", self.context)
        for response in (
            '{"type":"expense","amount":"m0","category":"invented","status":"single"}',
            '{"type":"expense","amount":"m0","category":"food","status":"single","account":"wechat"}',
        ):
            with self.subTest(response=response), self.assertRaises(ValueError):
                mapping.decode(response)

    def test_client_uses_sparse_type_first_grammar(self):
        text = "\u996d\u94b145\u5143"
        client = SparseCatalogClient(0)
        body = client.body_for(text, self.context)
        self.assertEqual(
            body["grammar"], SparseCatalogContract(text, self.context).grammar()
        )
        self.assertNotIn('\\"account\\"', body["grammar"])
        self.assertNotIn('\\"now\\"', body["messages"][0]["content"])


if __name__ == "__main__":
    unittest.main()
