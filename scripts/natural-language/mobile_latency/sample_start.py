"""Sample an owned model process during initialization without global setting changes."""

import argparse
import os
import subprocess

from backend import ARTIFACTS, AcceleratedServer, contract, native, write_json
from lean import LeanClient


class SampledServer(AcceleratedServer):
    def __init__(self, output):
        super().__init__("HTP0", "Qwen3.5-4B-Q4_0.gguf", 512, 512)
        self.output = output
        self.client = LeanClient(self.port)
        self.profile = None
        self.profile_log = None
        self.remote_profile = native.REMOTE + "/cold-start.perf.data"

    def sample(self):
        self.profile_log = (self.output / "simpleperf.log").open("wb")
        self.profile = subprocess.Popen(
            [
                str(native.ADB),
                "-s",
                native.SERIAL,
                "shell",
                "simpleperf",
                "record",
                "-p",
                self.pid,
                "-e",
                "cpu-cycles:u",
                "-f",
                "500",
                "--duration",
                "5",
                "--call-graph",
                "dwarf,16384",
                "-o",
                self.remote_profile,
            ],
            stdout=self.profile_log,
            stderr=self.profile_log,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        super().sample()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    native.SERIAL = args.serial
    output = ARTIFACTS / args.output
    output.mkdir(parents=True, exist_ok=False)
    server = SampledServer(output)
    manifest = {
        "serial": args.serial,
        "scope": "Instrumented startup diagnosis, not latency benchmark",
    }
    try:
        with server:
            manifest.update(
                pid=server.pid, load_ms=server.load_ms, arguments=server.arguments
            )
            print("model_ready", server.load_ms, flush=True)
            write_json(
                output / "prediction.json",
                server.client.parse("Coffee 12 yuan", contract.default_context()),
            )
    finally:
        if server.profile is not None:
            manifest["simpleperf_exit_code"] = server.profile.wait(timeout=10)
            server.profile_log.close()
            if manifest["simpleperf_exit_code"] == 0:
                native.adb("pull", server.remote_profile, str(output / "perf.data"))
                report = native.adb(
                    "shell",
                    "simpleperf",
                    "report",
                    "-i",
                    server.remote_profile,
                    "--sort",
                    "dso,symbol",
                    check=False,
                )
                (output / "report.txt").write_text(
                    report.stdout + report.stderr, encoding="utf-8"
                )
        write_json(output / "manifest.json", manifest)
        write_json(output / "pss-samples.json", server.samples)
    print(manifest.get("simpleperf_exit_code"), flush=True)


if __name__ == "__main__":
    main()
