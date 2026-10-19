"""Isolate native backend failures from constrained decoding without scoring quality."""

import argparse
import json
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path

import jinja2

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from backend import ARTIFACTS, native, sha256, write_json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--grammar", choices=("none", "literal"), default="none")
    parser.add_argument("--output", default="qwen3-2507-qairt-unconstrained")
    args = parser.parse_args()
    native.SERIAL = "HA29H4B6"
    original = ARTIFACTS / "qwen3-2507-qairt-smoke"
    output = ARTIFACTS / args.output
    output.mkdir(exist_ok=False)
    source = output / "source"
    source.mkdir()
    for name in ("diagnose.py", "runner.cpp"):
        shutil.copyfile(HERE / name, source / name)
    configuration = json.loads((original / "requests.json").read_text(encoding="utf-8"))
    full_request = {**configuration["requests"][0], "grammar": ""}
    template_path = ARTIFACTS / "qwen3-4b-2507/chat_template.jinja"
    template = jinja2.Environment(trim_blocks=True, lstrip_blocks=True).from_string(
        template_path.read_text(encoding="utf-8")
    )
    configuration["requests"] = [
        {
            "id": "simple-unconstrained",
            "prompt": template.render(
                messages=[{"role": "user", "content": "Reply with only the word OK."}],
                add_generation_prompt=True,
                tools=None,
            ),
            "grammar": 'root ::= "OK"\n' if args.grammar == "literal" else "",
        },
        full_request,
    ]
    request_path = output / "requests.json"
    write_json(request_path, configuration)
    remote_input = f"{native.REMOTE}/geniex-diagnostic-requests.json"
    native.adb("push", str(request_path), remote_input)
    prior_manifest = json.loads(
        (original / "manifest.json").read_text(encoding="utf-8")
    )
    env = prior_manifest["environment"]
    command = " ".join(f"{k}={shlex.quote(v)}" for k, v in env.items())
    command += " " + shlex.join(
        [f"{native.REMOTE}/geniex-v0.9.1/bin/finance-geniex-runner", remote_input]
    )
    manifest = {
        "serial": native.SERIAL,
        "scope": "Backend diagnostic only, not a quality benchmark",
        "grammar_mode": args.grammar,
        "request_sha256": sha256(request_path),
        "original_request_sha256": sha256(original / "requests.json"),
        "template_sha256": sha256(template_path),
        "source_hashes": {p.name: sha256(p) for p in source.iterdir()},
        "environment": env,
        "timeout_seconds": 90,
    }
    write_json(output / "manifest.json", manifest)
    start = time.perf_counter()
    with (
        (output / "stdout.log").open("w", encoding="utf-8") as stdout,
        (output / "stderr.log").open("w", encoding="utf-8") as stderr,
    ):
        process = subprocess.Popen(
            [str(native.ADB), "-s", native.SERIAL, "shell", command],
            stdout=stdout,
            stderr=stderr,
        )
        try:
            manifest["exit_code"] = process.wait(timeout=90)
        finally:
            manifest["elapsed_ms"] = (time.perf_counter() - start) * 1000
            if process.poll() is None:
                stdout.flush()
                for line in (
                    (output / "stdout.log").read_text(encoding="utf-8").splitlines()
                ):
                    if line.startswith("BENCH_JSON "):
                        event = json.loads(line[len("BENCH_JSON ") :])
                        if event["event"] == "started" and isinstance(
                            event["pid"], int
                        ):
                            native.adb("shell", "kill", str(event["pid"]), check=False)
                process.terminate()
                process.wait(timeout=10)
                manifest["timed_out"] = True
            write_json(output / "manifest.json", manifest)
    print(json.dumps(manifest, indent=2), flush=True)


if __name__ == "__main__":
    main()
