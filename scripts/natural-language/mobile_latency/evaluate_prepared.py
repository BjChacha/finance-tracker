"""Evaluate explicit context readiness and transfer review without UI claims."""

import argparse
import hashlib
import json
import shutil
import time
from pathlib import Path

from application_context import build_context, scoring_projection
from backend import (
    ARTIFACTS,
    HERE,
    ROOT,
    AcceleratedServer,
    contract,
    evaluation,
    native,
    sha256,
    write_json,
)
from guarded_catalog import configure_guarded_catalog
from preload import prime_context
from transfer_confirmation import confirm_transfer_direction


def context_key(context):
    active = contract.active_context(context)
    payload = contract.compact_json(
        {key: active[key] for key in ("accounts", "categories")}
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def main(
    configure_client=None, extra_sources=(), variant="prepared", validation_freeze=None
):
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--cache-mib", type=int, default=768, choices=(768, 1024))
    args = parser.parse_args()
    freeze_file = ARTIFACTS / "catalog-freeze.json"
    freeze = json.loads(freeze_file.read_text(encoding="utf-8"))
    for name, digest in freeze["files"].items():
        if sha256(ROOT / name) != digest:
            raise ValueError(f"Frozen source changed: {name}")
    if validation_freeze is not None:
        additional = json.loads(validation_freeze.read_text(encoding="utf-8"))
        if additional["base_freeze_sha256"] != sha256(freeze_file):
            raise ValueError("Frozen baseline reference changed")
        for name, digest in additional["files"].items():
            if sha256(ROOT / name) != digest:
                raise ValueError(f"Frozen variant source changed: {name}")
    rows = evaluation.load_rows(args.data)
    if not rows or len({r["id"] for r in rows}) != len(rows):
        raise ValueError("Expected a nonempty dataset with unique IDs")
    output = ARTIFACTS / args.output
    output.mkdir(exist_ok=False)
    source = output / "source"
    source.mkdir()
    if validation_freeze is not None:
        shutil.copyfile(validation_freeze, output / "variant-freeze.json")
    for name in ("evaluate_prepared.py", "transfer_confirmation.py", *extra_sources):
        shutil.copyfile(HERE / name, source / name)
    fixtures = {
        variant: build_context({"context_variant": variant})
        for variant in sorted({r["context_variant"] for r in rows})
    }
    write_json(output / "contexts.json", fixtures)
    native.SERIAL = args.serial
    server = AcceleratedServer("HTP0", batch=512, microbatch=512, power_mode="burst")
    configure_guarded_catalog(server, sparse=True, gate_examples=True)
    if configure_client is not None:
        configure_client(server)
    server.arguments[server.arguments.index("--cache-ram") + 1] = str(args.cache_mib)
    manifest = {
        "contract_variant": variant,
        "variant_freeze_sha256": (
            sha256(validation_freeze) if validation_freeze is not None else None
        ),
        "serial": args.serial,
        "arguments": server.arguments,
        "candidate_freeze_sha256": sha256(freeze_file),
        "data_sha256": sha256(args.data),
        "source_hashes": {p.name: sha256(p) for p in source.iterdir()},
        "scope": "Observed regression; readiness waits separate; native request plus review policy, not editable UI latency",
        "battery_before": native.adb("shell", "dumpsys", "battery").stdout,
    }
    write_json(output / "manifest.json", manifest)
    records, waits = [], []
    ready_context = None
    try:
        with (
            server,
            (output / "predictions.jsonl").open("w", encoding="utf-8") as stream,
        ):
            for index, row in enumerate(rows):
                fixture = fixtures[row["context_variant"]]
                context = fixture["context"]
                key = context_key(context)
                if ready_context != key:
                    priming = prime_context(server.client, context)
                    ready_context = key
                    waits.append(
                        {"before_id": row["id"], "context_key": key, "priming": priming}
                    )
                    write_json(output / "preload.json", waits)
                    if index == 0:
                        manifest["ready_ms"] = (
                            time.perf_counter() - server.started
                        ) * 1000
                        manifest["load_ms"] = server.load_ms
                        write_json(output / "manifest.json", manifest)
                    print("context_ready", index + 1, priming["elapsed_ms"], flush=True)
                started = time.perf_counter()
                raw = server.client.parse(row["text"], context)
                actual = confirm_transfer_direction(row["text"], context, raw)
                actual["before_review_elapsed_ms"] = raw["elapsed_ms"]
                actual["elapsed_ms"] = (time.perf_counter() - started) * 1000
                record = {
                    "expected": row,
                    "actual": actual,
                    "scoring_actual": scoring_projection(actual, fixture),
                    "context_key": key,
                }
                records.append(record)
                stream.write(json.dumps(record, ensure_ascii=False) + "\n")
                stream.flush()
                if not actual["schema_valid"]:
                    raise ValueError(actual.get("error", "Invalid response"))
                print("parsed", index + 1, round(actual["elapsed_ms"], 3), flush=True)
    except BaseException as error:
        write_json(
            output / "failure.json",
            {
                "type": type(error).__name__,
                "error": str(error),
                "records": len(records),
            },
        )
        raise
    finally:
        manifest["environment"] = getattr(server, "environment", {})
        manifest["battery_after"] = native.adb("shell", "dumpsys", "battery").stdout
        write_json(output / "manifest.json", manifest)
        write_json(output / "pss-samples.json", server.samples)
        write_json(output / "memory-errors.json", server.memory_errors)
        server.collect_log(output / "server.log")
    summary = evaluation.summarize(
        [{"expected": r["expected"], "actual": r["scoring_actual"]} for r in records]
    )
    summary["category_scope"] = (
        "Level-1 ancestor accuracy only; child labels are not annotated"
    )
    summary["native_request_latency_ms"] = summary.pop("observed_desktop_latency_ms")
    summary["context_waits_ms"] = [
        {"before_id": r["before_id"], "elapsed_ms": r["priming"]["elapsed_ms"]}
        for r in waits
    ]
    summary["requests_over_3s"] = sum(r["actual"]["elapsed_ms"] > 3000 for r in records)
    summary["request_max_ms"] = max(r["actual"]["elapsed_ms"] for r in records)
    write_json(output / "summary.json", summary)


if __name__ == "__main__":
    main()
