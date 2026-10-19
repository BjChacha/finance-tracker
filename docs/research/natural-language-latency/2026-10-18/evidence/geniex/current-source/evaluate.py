"""Evaluate the pinned native SDK with isolated KV state and offline model paths."""

import argparse
import json
import shlex
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

import jinja2

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from backend import ARTIFACTS, contract, evaluation, native, sha256, write_json
from lean import LeanClient, LeanContract


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", required=True)
    parser.add_argument("--plugin", choices=("llama_cpp", "qairt"), required=True)
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    native.SERIAL = args.serial
    output = ARTIFACTS / args.output
    output.mkdir(exist_ok=False)
    snapshot = output / "source"
    snapshot.mkdir()
    for name in ("runner.cpp", "build.sh", "evaluate.py"):
        shutil.copyfile(HERE / name, snapshot / name)
    for name in ("lean.py", "compact.py", "backend.py"):
        shutil.copyfile(HERE.parent / name, snapshot / name)
    rows = evaluation.load_rows(args.data)
    if args.limit:
        rows = rows[: args.limit]
    if len({r["id"] for r in rows}) != len(rows):
        raise ValueError("Input IDs must be unique")
    model_folder = ARTIFACTS / "qwen3-4b-2507"
    template_path = model_folder / "chat_template.jinja"
    template = jinja2.Environment(trim_blocks=True, lstrip_blocks=True).from_string(
        template_path.read_text(encoding="utf-8")
    )
    client = LeanClient(0)
    bodies = {}
    requests = []
    for row in rows:
        body = client.body_for(row["text"], contract.context_for(row), cache=False)
        bodies[row["id"]] = body
        requests.append(
            {
                "id": row["id"],
                "prompt": template.render(
                    messages=body["messages"], add_generation_prompt=True, tools=None
                ),
                "grammar": body["grammar"],
            }
        )
    write_json(
        output / "requests.json",
        {"plugin": args.plugin, "model_path": args.model_path, "requests": requests},
    )
    remote_input = f"{native.REMOTE}/geniex-requests.json"
    native.adb("push", str(output / "requests.json"), remote_input)
    root = f"{native.REMOTE}/geniex-v0.9.1"
    env = {
        "LD_LIBRARY_PATH": f"{root}/lib:{root}/lib/llama_cpp:{root}/lib/qairt:{root}/lib/qairt/htp-files",
        "GENIEX_PLUGIN_PATH": f"{root}/lib",
        "ADSP_LIBRARY_PATH": f"{root}/lib/llama_cpp;{root}/lib/qairt/htp-files",
    }
    command = (
        " ".join(f"{k}={shlex.quote(v)}" for k, v in env.items())
        + " "
        + shlex.join([f"{root}/bin/finance-geniex-runner", remote_input])
    )
    manifest = {
        "serial": args.serial,
        "plugin": args.plugin,
        "model_path": args.model_path,
        "template_sha256": sha256(template_path),
        "data_sha256": sha256(args.data),
        "request_sha256": sha256(output / "requests.json"),
        "source_hashes": {p.name: sha256(p) for p in snapshot.iterdir()},
        "environment": env,
        "scope": "Native batch, independent reset and full prompt per request, no application UI, no model manager, no online inference",
        "temperature": -1.0,
        "power_mode": "balanced",
        "battery_before": native.adb("shell", "dumpsys", "battery").stdout,
    }
    write_json(output / "manifest.json", manifest)
    sampler = native.AndroidServer()
    sampler.started = time.perf_counter()
    lookup = {r["id"]: r for r in rows}
    records = []
    process = None
    try:
        with (
            (output / "server.log").open("w", encoding="utf-8") as stderr,
            (output / "events.jsonl").open("w", encoding="utf-8") as events,
            (output / "predictions.jsonl").open("w", encoding="utf-8") as predictions,
        ):
            process = subprocess.Popen(
                [str(native.ADB), "-s", args.serial, "shell", command],
                stdout=subprocess.PIPE,
                stderr=stderr,
                encoding="utf-8",
                errors="strict",
            )
            for line in process.stdout:
                if not line.startswith("BENCH_JSON "):
                    stderr.write(line)
                    continue
                event = json.loads(line[len("BENCH_JSON ") :])
                events.write(json.dumps(event, ensure_ascii=False) + "\n")
                events.flush()
                if event["event"] == "started":
                    sampler.pid = str(event["pid"])
                    if not sampler.pid.isdecimal():
                        raise ValueError("Invalid owned process ID")
                    sampler.thread = threading.Thread(
                        target=sampler.sample, daemon=True
                    )
                    sampler.thread.start()
                elif event["event"] == "ready":
                    manifest.update(event)
                elif event["event"] == "error":
                    raise RuntimeError(event["error"])
                elif event["event"] == "result":
                    row = lookup[event["id"]]
                    result = {
                        "schema_valid": False,
                        "request": bodies[row["id"]],
                        "response": event["response"],
                        "elapsed_ms": event["elapsed_ms"],
                        "native_event": event,
                    }
                    try:
                        if event["code"] != 0 or event["stop_reason"] not in (
                            "eos",
                            "stop_sequence",
                        ):
                            raise ValueError(
                                "Native generation did not complete normally"
                            )
                        decision = LeanContract(
                            row["text"], contract.context_for(row)
                        ).decode(event["response"])
                        result.update(
                            schema_valid=True,
                            decision=decision,
                            validated=contract.validate_business(
                                decision, row["text"], contract.context_for(row)
                            ),
                        )
                    except (ValueError, KeyError, TypeError) as error:
                        result["error"] = str(error)
                    if not records:
                        manifest["process_cold_first_result_ms"] = (
                            time.perf_counter() - sampler.started
                        ) * 1000
                    records.append({"expected": row, "actual": result})
                    predictions.write(
                        json.dumps(records[-1], ensure_ascii=False) + "\n"
                    )
                    predictions.flush()
                    print(
                        args.output,
                        len(records),
                        result["elapsed_ms"],
                        result.get("decision", result.get("error")),
                        flush=True,
                    )
            if process.wait(timeout=10) != 0 or len(records) != len(rows):
                raise RuntimeError("Incomplete native batch")
    finally:
        sampler.stop_sampling.set()
        if hasattr(sampler, "thread"):
            sampler.thread.join(timeout=5)
        if process and process.poll() is None:
            if sampler.pid:
                native.adb("shell", "kill", sampler.pid, check=False)
            process.terminate()
            process.wait(timeout=10)
        manifest["battery_after"] = native.adb("shell", "dumpsys", "battery").stdout
        write_json(output / "manifest.json", manifest)
        write_json(output / "pss-samples.json", sampler.samples)
        write_json(output / "memory-errors.json", sampler.memory_errors)
    summary = evaluation.summarize(records)
    summary["native_request_latency_ms"] = summary.pop("observed_desktop_latency_ms")
    write_json(output / "summary.json", summary)


if __name__ == "__main__":
    main()
