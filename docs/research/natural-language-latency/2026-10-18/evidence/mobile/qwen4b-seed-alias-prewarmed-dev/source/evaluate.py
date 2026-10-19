"""Measure native request latency and quality; this is not application UI latency."""

import argparse
import json
import time
from pathlib import Path

from backend import (
    ARTIFACTS,
    HERE,
    MODEL,
    AcceleratedServer,
    contract,
    evaluation,
    native,
    sha256,
    write_json,
)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", required=True)
    parser.add_argument(
        "--device", choices=("GPUOpenCL", "HTP0", "none"), required=True
    )
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--batch", type=int, default=128)
    parser.add_argument("--microbatch", type=int, default=64)
    parser.add_argument("--template", default="qwen35-official-template.jinja")
    parser.add_argument(
        "--format",
        choices=(
            "baseline",
            "compact",
            "numeric-ws",
            "semantic",
            "status-first",
            "grouped",
            "evidence-array",
            "lean",
            "counting",
            "array-last",
            "guard-examples",
            "two-stage",
            "alias",
        ),
        default="baseline",
    )
    parser.add_argument("--output", required=True)
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--prewarm", action="store_true")
    parser.add_argument("--sparse-accounts", action="store_true")
    parser.add_argument(
        "--context", choices=("baseline", "application-seed"), default="baseline"
    )
    parser.add_argument(
        "--two-stage-layout", choices=("split", "unified", "single"), default="split"
    )
    parser.add_argument("--spec-ngram-match", type=int, choices=(2, 4))
    parser.add_argument("--spec-static-cache", type=Path)
    args = parser.parse_args()
    if args.prewarm and (args.no_cache or args.format == "two-stage"):
        parser.error("Prewarming currently requires one cached field-extraction stage")
    if args.sparse_accounts and args.format != "two-stage":
        parser.error("Sparse accounts require the two-stage format")
    if args.spec_ngram_match is not None and args.spec_static_cache is not None:
        parser.error("Select one speculation implementation")
    native.SERIAL = args.serial
    output = ARTIFACTS / args.output
    output.mkdir(parents=True, exist_ok=False)
    rows = evaluation.load_rows(args.data)
    if args.limit:
        rows = rows[: args.limit]
    server = AcceleratedServer(
        args.device, args.model, args.batch, args.microbatch, args.template
    )
    if args.spec_ngram_match is not None:
        server.arguments.extend(
            [
                "--spec-type",
                "ngram-mod",
                "--spec-ngram-mod-n-match",
                str(args.spec_ngram_match),
                "--spec-ngram-mod-n-min",
                "1",
                "--spec-ngram-mod-n-max",
                "6",
            ]
        )
    if args.spec_static_cache is not None:
        native.adb(
            "push",
            str(args.spec_static_cache),
            f"{native.REMOTE}/{args.spec_static_cache.name}",
        )
        server.arguments.extend(
            [
                "--spec-type",
                "ngram-cache",
                "--lookup-cache-static",
                args.spec_static_cache.name,
            ]
        )
    sources = ["backend.py", "evaluate.py"]
    if args.prewarm:
        from preload import prime_context

        sources.append("preload.py")
    fixtures = {}
    if args.context == "application-seed":
        from application_context import build_context, scoring_projection

        sources.append("application_context.py")
        fixtures = {
            variant: build_context({"context_variant": variant})
            for variant in sorted(
                {row.get("context_variant", "default") for row in rows}
            )
        }
        write_json(output / "contexts.json", fixtures)
    if args.format != "baseline":
        from compact import CompactClient

        server.client = CompactClient(server.port)
        sources.extend(["compact.py", "compact_prompt.txt"])
        if args.format == "numeric-ws":
            from whitespace import WhitespaceCompactClient

            server.client = WhitespaceCompactClient(server.port)
            sources.append("whitespace.py")
        elif args.format == "semantic":
            from semantic import SemanticClient

            server.client = SemanticClient(server.port)
            sources.extend(["semantic.py", "semantic_prompt.txt"])
        elif args.format == "status-first":
            from status_first import StatusFirstClient

            server.client = StatusFirstClient(server.port)
            sources.append("status_first.py")
        elif args.format == "grouped":
            from grouped import GroupedClient

            server.client = GroupedClient(server.port)
            sources.append("grouped.py")
        elif args.format == "evidence-array":
            from evidence_array import EvidenceArrayClient

            server.client = EvidenceArrayClient(server.port)
            sources.extend(["semantic.py", "semantic_prompt.txt", "evidence_array.py"])
        elif args.format == "lean":
            from lean import LeanClient

            server.client = LeanClient(server.port)
            sources.append("lean.py")
        elif args.format == "counting":
            from counting import CountingClient

            server.client = CountingClient(server.port)
            sources.extend(["lean.py", "counting.py", "count_prompt.txt"])
        elif args.format == "array-last":
            from array_last import ArrayLastClient

            server.client = ArrayLastClient(server.port)
            sources.extend(["lean.py", "array_last.py"])
        elif args.format == "guard-examples":
            from guard_examples import GuardExamplesClient

            server.client = GuardExamplesClient(server.port)
            sources.extend(["lean.py", "guard_examples.py", "guard_examples.txt"])
        elif args.format == "two-stage":
            from two_stage import configure_two_stage

            configure_two_stage(server, args.two_stage_layout, args.sparse_accounts)
            sources.extend(
                ["lean.py", "two_stage.py", "semantic_gate.py", "gate_prompt.txt"]
            )
            if args.sparse_accounts:
                sources.append("sparse_accounts.txt")
        elif args.format == "alias":
            from aliases import AliasLeanClient

            server.client = AliasLeanClient(server.port)
            sources.extend(["lean.py", "aliases.py"])
    snapshot = output / "source"
    snapshot.mkdir()
    for name in sources:
        (snapshot / name).write_bytes((HERE / name).read_bytes())
    manifest = {
        "serial": args.serial,
        "device": args.device,
        "model": args.model,
        "format": args.format,
        "context": args.context,
        "cache_prompt": not args.no_cache,
        "prewarm": args.prewarm,
        "static_cache_sha256": sha256(args.spec_static_cache)
        if args.spec_static_cache
        else None,
        "arguments": server.arguments,
        "data_sha256": sha256(args.data),
        "source_hashes": {name: sha256(HERE / name) for name in sources},
        "scope": "Native loopback request plus validation; no application UI; no fine-tuning",
        "battery_before": native.adb("shell", "dumpsys", "battery").stdout,
    }
    write_json(output / "manifest.json", manifest)
    records = []
    start = time.perf_counter()
    try:
        with (
            server,
            (output / "predictions.jsonl").open("w", encoding="utf-8") as stream,
        ):
            if args.prewarm:
                first_fixture = fixtures.get(rows[0].get("context_variant", "default"))
                first_context = (
                    first_fixture["context"]
                    if first_fixture
                    else contract.context_for(rows[0])
                )
                priming = prime_context(server.client, first_context)
                manifest["ready_ms"] = (time.perf_counter() - start) * 1000
                manifest["priming_ms"] = priming["elapsed_ms"]
                manifest["load_ms"] = server.load_ms
                write_json(output / "preload.json", priming)
                write_json(output / "manifest.json", manifest)
            for index, row in enumerate(rows):
                fixture = fixtures.get(row.get("context_variant", "default"))
                context = fixture["context"] if fixture else contract.context_for(row)
                actual = server.client.parse(
                    row["text"], context, cache=not args.no_cache
                )
                records.append({"expected": row, "actual": actual})
                if fixture:
                    records[-1]["scoring_actual"] = scoring_projection(actual, fixture)
                if index == 0:
                    manifest["process_cold_first_result_ms"] = (
                        time.perf_counter() - start
                    ) * 1000
                    manifest["load_ms"] = server.load_ms
                stream.write(json.dumps(records[-1], ensure_ascii=False) + "\n")
                stream.flush()
                print(
                    args.output,
                    index + 1,
                    actual.get("elapsed_ms"),
                    actual.get("decision"),
                    flush=True,
                )
                if not actual["schema_valid"]:
                    raise ValueError(actual.get("error"))
    finally:
        manifest["environment"] = getattr(server, "environment", {})
        manifest["battery_after"] = native.adb("shell", "dumpsys", "battery").stdout
        write_json(output / "manifest.json", manifest)
        write_json(output / "pss-samples.json", server.samples)
        write_json(output / "memory-errors.json", server.memory_errors)
        native.adb(
            "pull",
            f"{native.REMOTE}/{server.log}",
            str(output / "server.log"),
            check=False,
        )
    summary = evaluation.summarize(
        [
            {
                "expected": row["expected"],
                "actual": row.get("scoring_actual", row["actual"]),
            }
            for row in records
        ]
    )
    if fixtures:
        summary["category_scope"] = (
            "Level-1 ancestor accuracy only; child labels are not annotated"
        )
    summary["native_request_latency_ms"] = summary.pop("observed_desktop_latency_ms")
    write_json(output / "summary.json", summary)


if __name__ == "__main__":
    main()
