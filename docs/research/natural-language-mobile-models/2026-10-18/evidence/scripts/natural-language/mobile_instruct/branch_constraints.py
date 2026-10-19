"""Enforce type/category/destination relationships during local decoding."""

from runtime import Client, contract  # isort: skip

from desktop_compare import DesktopServer
from device_runtime import DeviceServer


class BranchClient(Client):
    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        body.pop("response_format")
        body["grammar"] = contract.grammar_for(text, context)
        return body


class BranchDesktop(DesktopServer):
    def __init__(self):
        super().__init__()
        self.port = 18485
        self.client = BranchClient(self.port)


class BranchDevice(DeviceServer):
    def __init__(self):
        super().__init__("qwen")
        self.client = BranchClient(self.port)


__all__ = ["BranchClient", "BranchDesktop", "BranchDevice"]
