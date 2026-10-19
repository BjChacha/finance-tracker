"""Apply the same frozen benchmark protocol to an explicit model and device."""

import argparse
import sys
from pathlib import Path

import benchmark
from device_runtime import DeviceServer, native
from runtime import ARTIFACTS, HERE, sha256, write_json


class ParseClient:
    def __init__(self, server):
        self.server = server

    def parse(self, text, context, **options):
        # A cold process has no prefix/document cache regardless of cache flags.
        return self.server.parse(text, context)


class ServerAdapter:
    def __init__(self, kind):
        self.server = DeviceServer(kind)
        self.client = ParseClient(self.server)

    def __getattr__(self, key):
        return getattr(self.server, key)

    def __enter__(self):
        self.server.__enter__()
        return self

    def __exit__(self, *args):
        return self.server.__exit__(*args)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--serial", required=True)
    ap.add_argument("--kind", choices=("qwen", "jev"), required=True)
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    native.SERIAL = args.serial
    metadata = {
        "serial": args.serial,
        "kind": args.kind,
        "identity": native.adb(
            "shell", "getprop", "ro.product.marketname"
        ).stdout.strip(),
        "arguments": DeviceServer(args.kind).arguments,
        "data_sha256": sha256(args.data),
        "source_hashes": {
            name: sha256(HERE / name)
            for name in (
                "benchmark.py",
                "device_benchmark.py",
                "device_runtime.py",
                "runtime.py",
                "prompt.txt",
            )
        },
        "cold_cache": "New process and parser; no persistent vectors or KV; OS page cache retained",
        "warm_cache": "Same loaded model and parser, varied inputs; Qwen prefix/Jev candidate cache retained",
    }
    write_json(ARTIFACTS / f"{args.output}-metadata.json", metadata)
    benchmark.PhoneServer = lambda: ServerAdapter(args.kind)
    sys.argv = [__file__, "--data", str(args.data), "--output", args.output]
    benchmark.main()


if __name__ == "__main__":
    main()
