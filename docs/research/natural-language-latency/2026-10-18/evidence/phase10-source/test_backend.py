"""A rejected launch must not collect logs owned by another live experiment."""

import unittest
from unittest.mock import Mock, patch

from backend import AcceleratedServer


class OwnershipTests(unittest.TestCase):
    def test_rejected_launch_does_not_collect_foreign_log(self):
        server = AcceleratedServer("HTP0")
        with patch("backend.native.adb") as adb:
            self.assertFalse(server.collect_log("unused.log"))
            adb.assert_not_called()

    def test_owned_launch_collects_its_log(self):
        server = AcceleratedServer("HTP0")
        server.pid = "123"
        with patch("backend.native.adb", return_value=Mock(returncode=0)) as adb:
            self.assertTrue(server.collect_log("unused.log"))
            adb.assert_called_once()


if __name__ == "__main__":
    unittest.main()
