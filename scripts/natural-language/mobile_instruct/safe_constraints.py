"""Keep chat control delimiters inside serialized data, not the chat protocol."""

from branch_constraints import BranchClient, BranchDesktop, BranchDevice


class SafeBranchClient(BranchClient):
    def body_for(self, text, context, cache=True):
        body = super().body_for(text, context, cache)
        for message in body["messages"]:
            message["content"] = (
                message["content"].replace("<", r"\u003c").replace(">", r"\u003e")
            )
        return body


class SafeDesktop(BranchDesktop):
    def __init__(self):
        super().__init__()
        self.client = SafeBranchClient(self.port)


class SafeDevice(BranchDevice):
    def __init__(self):
        super().__init__()
        self.client = SafeBranchClient(self.port)


__all__ = ["SafeBranchClient", "SafeDesktop", "SafeDevice"]
