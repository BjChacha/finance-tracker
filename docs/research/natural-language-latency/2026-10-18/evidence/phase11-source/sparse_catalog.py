"""Omit forced-null wire fields without changing category or account choices."""

from backend import HERE
from labels import CatalogLeanClient, CatalogLeanContract
from two_stage import SparseNullAccounts


class SparseCatalogContract(SparseNullAccounts, CatalogLeanContract):
    pass


class SparseCatalogClient(CatalogLeanClient):
    contract_type = SparseCatalogContract

    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        body["grammar"] = self.contract_type(text, context).grammar()
        body["messages"][0]["content"] += "\n" + (
            HERE / "sparse_accounts.txt"
        ).read_text(encoding="utf-8")
        return body
