"""Check named-account diagnostic probes; report status and unsafe complete previews."""

import argparse
import json
import shutil
import time

from backend import (
    ARTIFACTS,
    HERE,
    MODEL,
    AcceleratedServer,
    contract,
    native,
    sha256,
    write_json,
)
from guard_examples import GuardExamplesClient


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--template", default="qwen35-official-template.jinja")
    parser.add_argument("--sparse-accounts", action="store_true")
    parser.add_argument("--application-seed", action="store_true")
    parser.add_argument("--prewarm", action="store_true")
    parser.add_argument(
        "--power-mode",
        choices=("balanced", "sustained_high_performance", "burst"),
        default="balanced",
    )
    parser.add_argument(
        "--two-stage-layout", choices=("split", "unified", "single"), default="split"
    )
    parser.add_argument(
        "--format",
        choices=(
            "lean",
            "guard-examples",
            "status-first",
            "two-stage",
            "label",
            "catalog",
        ),
        default="guard-examples",
    )
    args = parser.parse_args()
    if args.sparse_accounts and args.format != "two-stage":
        parser.error("Sparse accounts require the two-stage format")
    if args.prewarm and args.format == "two-stage":
        parser.error("Two-stage prewarming is not configured")
    native.SERIAL = args.serial
    output = ARTIFACTS / args.output
    output.mkdir(parents=True, exist_ok=False)
    probes = HERE.parent / "mobile_instruct/probes.json"
    rows = json.loads(probes.read_text(encoding="utf-8"))
    server = AcceleratedServer(
        "HTP0",
        args.model,
        batch=512,
        microbatch=512,
        template=args.template,
        power_mode=args.power_mode,
    )
    if args.format == "lean":
        from lean import LeanClient

        server.client = LeanClient(server.port)
    elif args.format == "two-stage":
        from two_stage import configure_two_stage

        configure_two_stage(server, args.two_stage_layout, args.sparse_accounts)
    elif args.format == "status-first":
        from status_first import StatusFirstClient

        server.client = StatusFirstClient(server.port)
    elif args.format in ("label", "catalog"):
        from labels import CatalogLeanClient, LabelLeanClient

        server.client = (
            CatalogLeanClient if args.format == "catalog" else LabelLeanClient
        )(server.port)
    else:
        server.client = GuardExamplesClient(server.port)
    snapshot = output / "source"
    snapshot.mkdir()
    for name in (
        "probe_examples.py",
        "guard_examples.py",
        "guard_examples.txt",
        "lean.py",
        "compact.py",
        "backend.py",
        "status_first.py",
        "two_stage.py",
        "semantic_gate.py",
        "gate_prompt.txt",
        "sparse_accounts.txt",
        "aliases.py",
        "labels.py",
        "semantic_catalog.json",
        "application_context.py",
        "preload.py",
    ):
        shutil.copyfile(HERE / name, snapshot / name)
    records = []
    manifest = {
        "serial": args.serial,
        "probe_sha256": sha256(probes),
        "model": args.model,
        "format": args.format,
        "application_seed": args.application_seed,
        "prewarm": args.prewarm,
        "scope": "Previously observed status-only diagnostic probes, not an independent test",
    }
    context = contract.context_for({"context_variant": "default"})
    if args.application_seed:
        from application_context import build_context

        fixture = build_context({"context_variant": "default"})
        context = fixture["context"]
        write_json(output / "context.json", fixture)
    try:
        with server:
            if args.prewarm:
                from preload import prime_context

                write_json(
                    output / "preload.json", prime_context(server.client, context)
                )
                manifest["ready_ms"] = (time.perf_counter() - server.started) * 1000
            for row in rows:
                result = server.client.parse(row["text"], context)
                records.append({"expected": row, "actual": result})
                write_json(output / "predictions.json", records)
                print(
                    row["id"],
                    result["decision"],
                    (result.get("validated") or {}).get("status"),
                    flush=True,
                )
        write_json(output / "predictions.json", records)
        manifest["correct_status"] = sum(
            (r["actual"].get("decision") or {}).get("status") == r["expected"]["status"]
            for r in records
        )
        manifest["unsafe_complete"] = sum(
            r["expected"]["status"] == "clarify"
            and (r["actual"].get("validated") or {}).get("status") == "preview"
            for r in records
        )
    finally:
        manifest["arguments"] = server.arguments
        manifest["environment"] = getattr(server, "environment", {})
        write_json(output / "manifest.json", manifest)
        write_json(output / "pss-samples.json", server.samples)
        write_json(output / "memory-errors.json", server.memory_errors)
        server.collect_log(output / "server.log")


if __name__ == "__main__":
    main()
