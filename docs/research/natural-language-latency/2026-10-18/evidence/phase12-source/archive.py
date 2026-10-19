"""Archive completed runs and verify compressed evidence against source files."""

import gzip
import json
import shutil

from backend import ARTIFACTS, ROOT, sha256, write_json

DESTINATION = ROOT / "docs/research/natural-language-latency/2026-10-18/evidence"


def main():
    DESTINATION.mkdir(parents=True, exist_ok=True)
    entries = []

    def archive(path, relative, compress=False):
        target = DESTINATION / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = path.read_bytes()
        if compress:
            target = target.with_suffix(target.suffix + ".gz")
            target.write_bytes(gzip.compress(payload, mtime=0))
            if gzip.decompress(target.read_bytes()) != payload:
                raise ValueError("Compressed evidence mismatch")
        else:
            shutil.copyfile(path, target)
            if sha256(path) != sha256(target):
                raise ValueError("Copied evidence mismatch")
        entries.append(
            {
                "source": str(path.relative_to(ROOT)).replace("\\", "/"),
                "source_sha256": sha256(path),
                "archive": str(target.relative_to(DESTINATION)).replace("\\", "/"),
                "archive_sha256": sha256(target),
                "bytes": target.stat().st_size,
            }
        )

    for family, base in (("mobile", ARTIFACTS), ("gliner", ARTIFACTS / "gliner")):
        for folder in sorted(base.iterdir()):
            if not folder.is_dir() or not (folder / "summary.json").exists():
                continue
            predictions = folder / "predictions.jsonl"
            if not predictions.exists():
                continue
            summary = json.loads((folder / "summary.json").read_text(encoding="utf-8"))
            if (
                len(predictions.read_text(encoding="utf-8").splitlines())
                != summary["total"]
            ):
                raise ValueError(f"Incomplete run: {folder.name}")
            for name in (
                "summary.json",
                "manifest.json",
                "predictions.jsonl",
                "server.log",
                "pss-samples.json",
                "memory-errors.json",
                "contexts.json",
                "preload.json",
                "candidate-freeze-reference.json",
            ):
                path = folder / name
                if path.exists():
                    archive(
                        path,
                        f"{family}/{folder.name}/{name}",
                        compress=name
                        in ("predictions.jsonl", "server.log", "pss-samples.json"),
                    )
            if (folder / "source").exists():
                for path in sorted((folder / "source").iterdir()):
                    archive(path, f"{family}/{folder.name}/source/{path.name}")

    for summary_file in sorted(ARTIFACTS.glob("*/gate-summary.json")):
        folder = summary_file.parent
        summary = json.loads(summary_file.read_text(encoding="utf-8"))
        predictions = folder / "predictions.jsonl"
        if (
            len(predictions.read_text(encoding="utf-8").splitlines())
            != summary["total"]
        ):
            raise ValueError(f"Incomplete gate run: {folder.name}")
        for path in sorted(folder.rglob("*")):
            if path.is_file():
                archive(
                    path,
                    f"gates/{folder.name}/{path.relative_to(folder).as_posix()}",
                    compress=path.name
                    in ("predictions.jsonl", "server.log", "pss-samples.json"),
                )
    for path in sorted((ARTIFACTS / "qwen4b-two-stage-dev").rglob("*")):
        if path.is_file():
            archive(
                path,
                f"incomplete/qwen4b-two-stage-dev/{path.relative_to(ARTIFACTS / 'qwen4b-two-stage-dev').as_posix()}",
                compress=path.name.endswith(".log"),
            )
    for name in (
        "phase10-integrity.json",
        "gate-comparison.json",
        "application-context-failures.json",
        "catalog-comparison.json",
        "phase11-integrity.json",
        "catalog-freeze.json",
        "context-cache-comparison.json",
        "transfer-confirmation-replay.json",
        "prepared-comparison.json",
        "phase12-integrity.json",
    ):
        path = ARTIFACTS / name
        if path.exists():
            archive(path, name)
    for name in (
        "aliases.py",
        "application_context.py",
        "test_aliases.py",
        "test_application_context.py",
        "semantic_gate.py",
        "gate_prompt.txt",
        "gate_examples.txt",
        "two_stage.py",
        "test_two_stage.py",
        "sparse_accounts.txt",
        "evaluate_gate.py",
        "lean.py",
        "preload.py",
        "test_preload.py",
        "test_backend.py",
        "profile_cold.py",
        "analyze_cold.py",
    ):
        historical = ARTIFACTS / "phase10-source" / name
        if not historical.exists():
            historical.parent.mkdir(parents=True, exist_ok=True)
            prior = DESTINATION / "phase10-source" / name
            if not prior.exists():
                raise ValueError(f"Missing phase-10 source snapshot: {name}")
            shutil.copyfile(prior, historical)
        archive(historical, f"phase10-source/{name}")

    for name in (
        "aliases.py",
        "labels.py",
        "semantic_catalog.json",
        "guarded_catalog.py",
        "sparse_catalog.py",
        "two_stage.py",
        "preload.py",
        "backend.py",
        "evaluate.py",
        "probe_examples.py",
        "catalog_report.py",
        "context_cache.py",
        "transfer_confirmation.py",
        "test_transfer_confirmation.py",
        "replay_transfer_confirmation.py",
        "test_labels.py",
        "test_guarded_catalog.py",
        "test_sparse_catalog.py",
        "test_preload.py",
        "test_backend.py",
        "account_evidence.py",
        "test_account_evidence.py",
        "gate_examples.txt",
    ):
        archive(
            ROOT / "scripts/natural-language/mobile_latency" / name,
            f"phase11-source/{name}",
        )

    for name in (
        "evaluate_prepared.py",
        "test_prepared_context.py",
        "prepared_report.py",
        "archive.py",
    ):
        archive(
            ROOT / "scripts/natural-language/mobile_latency" / name,
            f"phase12-source/{name}",
        )

    for name in (
        "runtime-manifest.json",
        "experiment-metrics.json",
        "frozen-audit.json",
        "harness-example-delta.json",
        "speculation-comparison.json",
    ):
        archive(ARTIFACTS / name, name)
    for path in sorted(
        (ROOT / "scripts/natural-language/mobile_latency/app_probe").glob("*")
    ):
        if path.is_file():
            archive(path, f"app-uid-probe/source/{path.name}")
    for relative in (
        "build/manifest.json",
        "build/context.json",
        "build/assets/requests.json",
        "build/assets/template.jinja",
    ):
        path = ARTIFACTS / "app-uid-probe" / relative
        if path.exists():
            archive(path, f"app-uid-probe/{relative}")
    for folder in sorted((ARTIFACTS / "app-uid-probe").iterdir()):
        if folder.is_dir() and folder.name != "build":
            for path in sorted(folder.glob("*")):
                if path.is_file() and path.suffix in (".json", ".log"):
                    archive(path, f"app-uid-probe/{folder.name}/{path.name}")
    for name in ("structure-cache", "account-evidence-replay"):
        for path in sorted((ARTIFACTS / name).rglob("*")):
            if path.is_file():
                relative = path.relative_to(ARTIFACTS).as_posix()
                archive(
                    path,
                    relative,
                    compress=path.suffix == ".jsonl"
                    or path.name in ("server.log", "tokens.json"),
                )
    for name in ("structure_cache.py", "speculation_delta.py"):
        archive(
            ROOT / "scripts/natural-language/mobile_latency" / name,
            f"speculation-source/{name}",
        )
    for name in ("qwen35-2b", "qwen35-4b-q4_0", "qwen3-1.7b"):
        if (ARTIFACTS / name / "manifest.json").exists():
            archive(ARTIFACTS / name / "manifest.json", f"models/{name}.json")
    for name in ("repack-parity", "qwen4b-repack-comparison-ready"):
        for path in sorted((ARTIFACTS / name).rglob("*")):
            if path.is_file():
                relative = path.relative_to(ARTIFACTS).as_posix()
                archive(
                    path,
                    f"native-repack/{relative}",
                    compress=path.name
                    in ("predictions.json", "server.log", "pss-samples.json"),
                )
    for probes in sorted(ARTIFACTS.glob("*-probes")):
        if not (probes / "predictions.json").exists():
            continue
        for path in sorted(probes.rglob("*")):
            if path.is_file():
                prefix = (
                    "probes"
                    if probes.name == "qwen4b-example-named-probes"
                    else f"probes/{probes.name}"
                )
                archive(
                    path,
                    f"{prefix}/{path.relative_to(probes).as_posix()}",
                    compress=path.name
                    in ("predictions.json", "server.log", "pss-samples.json"),
                )
    for name in (
        "qwen3-2507-qairt-smoke",
        "qwen3-2507-qairt-unconstrained",
        "qwen3-2507-qairt-literal",
        "geniex-sampler-contract",
    ):
        for path in sorted((ARTIFACTS / name).rglob("*")):
            if path.is_file():
                archive(
                    path,
                    f"geniex/{name}/{path.relative_to(ARTIFACTS / name).as_posix()}",
                    compress=path.suffix in (".log", ".jsonl")
                    or path.name in ("requests.json", "pss-samples.json"),
                )
    model = ARTIFACTS / "qwen3-4b-2507"
    for path in sorted(model.iterdir()):
        if (
            path.is_file()
            and path.name != "tokenizer.json"
            and (path.suffix in (".json", ".md", ".jinja") or path.name == "LICENSE")
        ):
            archive(path, f"models/qwen3-4b-2507/{path.name}")
    research = ARTIFACTS / "geniex-research"
    for path in sorted(research.iterdir()):
        if path.is_file() and (
            path.suffix in (".json", ".txt", ".sha256")
            or path.name in ("LICENSE", "NOTICE")
        ):
            archive(
                path,
                f"geniex/research/{path.name}",
                compress=path.name.endswith("tree.json"),
            )
    for name in (
        "sdk/plugins/qairt/include/sampler_config_utils.h",
        "qairt-core/core/src/llm/llm_model.cpp",
        "qairt-core/core/src/llm/llm_spec_loader.cpp",
        "proc/include/geniex-proc/sampler.h",
        "proc/src/sampler/sampler.cpp",
        "proc/src/geniex-sampling/geniex-sampling.cpp",
        "proc/src/geniex-sampling/geniex-grammar.cpp",
    ):
        archive(research / name, f"geniex/upstream-source/{name}", compress=True)
    for path in sorted(
        (ROOT / "scripts/natural-language/mobile_latency/geniex").iterdir()
    ):
        if path.is_file():
            archive(path, f"geniex/current-source/{path.name}")
    for name in ("get_qwen3_2507.py", "get_geniex_bundle.py"):
        archive(
            ROOT / "scripts/natural-language/mobile_latency" / name,
            f"geniex/current-source/{name}",
        )
    for path in sorted(
        (ROOT / "scripts/natural-language/mobile_latency/native_repack").iterdir()
    ):
        if path.is_file():
            archive(path, f"native-repack/source/{path.name}")
    for name in ("toolchain-amd64-manifest.json", "repack-offline-build.log"):
        archive(
            ARTIFACTS / name, f"native-repack/{name}", compress=name.endswith(".log")
        )
    for name in ("manifest.json", "deployment.json"):
        archive(
            ARTIFACTS / "snapdragon-repack-b11669-v2" / name,
            f"native-repack/runtime/{name}",
        )
    for name in ("GLiNER2.5-multi-Decide", "gliner2.5-multi-v1"):
        archive(
            ARTIFACTS / "gliner" / name / "download-manifest.json",
            f"models/{name}.json",
        )
    for path in (ARTIFACTS / "gliner").glob("decide-diagnostics-*.json"):
        archive(path, f"gliner/{path.name}")
    archive(
        ARTIFACTS / "gliner/environment-freeze.txt", "gliner/environment-freeze.txt"
    )
    for path in (ROOT / "scripts/natural-language/gliner_bench").glob("*"):
        if path.is_file():
            archive(path, f"gliner/current-source/{path.name}")
    trace_entries = []
    for folder in sorted(ARTIFACTS.glob("*-cold-profile")):
        if not (folder / "manifest.json").exists():
            continue
        for path in folder.iterdir():
            if path.is_file() and path.suffix in (".json", ".log"):
                archive(
                    path,
                    f"profiles/{folder.name}/{path.name}",
                    compress=path.name in ("pss-samples.json", "server.log"),
                )
        for path in sorted((folder / "source").glob("*")):
            if path.is_file():
                archive(path, f"profiles/{folder.name}/source/{path.name}")
        trace = folder / "trace.pb"
        trace_entries.append(
            {
                "path": str(trace.relative_to(ROOT)),
                "sha256": sha256(trace),
                "bytes": trace.stat().st_size,
            }
        )
    sampling = ARTIFACTS / "qwen4b-q4_0-startup-sampling"
    if (sampling / "manifest.json").exists():
        for name in ("manifest.json", "simpleperf.log", "report.txt"):
            path = sampling / name
            if path.exists():
                archive(path, f"profiles/{sampling.name}/{name}")
        raw = sampling / "perf.data"
        if raw.exists():
            trace_entries.append(
                {
                    "path": str(raw.relative_to(ROOT)),
                    "sha256": sha256(raw),
                    "bytes": raw.stat().st_size,
                }
            )
    write_json(
        DESTINATION.parent / "evidence-manifest.json",
        {"files": entries, "raw_traces": trace_entries},
    )
    print(
        len(entries), "files", sum(row["bytes"] for row in entries), "bytes", flush=True
    )


if __name__ == "__main__":
    main()
