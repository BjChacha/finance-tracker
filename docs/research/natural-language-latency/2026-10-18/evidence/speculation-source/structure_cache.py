"""Build a speculative format cache from the active schema, without transaction examples."""

import argparse
import itertools
import struct
from collections import Counter, defaultdict

from backend import ARTIFACTS, AcceleratedServer, contract, native, sha256, write_json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", required=True)
    args = parser.parse_args()
    native.SERIAL = args.serial
    output = ARTIFACTS / "structure-cache"
    output.mkdir(exist_ok=False)
    context = contract.context_for({"context_variant": "default"})
    accounts = [None] + [row["id"] for row in context["accounts"]]
    examples = []
    for category in context["categories"]:
        kind = category["type"]
        destinations = accounts if kind == "transfer" else [None]
        for amount, account, destination, status in itertools.product(
            (None, "m0", "m1", "m2", "m3"),
            accounts,
            destinations,
            ("single", "clarify"),
        ):
            if account is not None and account == destination:
                continue
            examples.append(
                contract.compact_json(
                    {
                        "type": kind,
                        "amount": amount,
                        "category": category["id"],
                        "account": account,
                        "to_account": destination,
                        "status": status,
                    }
                )
            )
    text = "\n".join(examples)
    (output / "schema-patterns.jsonl").write_text(text, encoding="utf-8")
    server = AcceleratedServer("HTP0", batch=512, microbatch=512)
    try:
        with server:
            response = server.client.request(
                "/tokenize", {"content": text, "add_special": False}, timeout=120
            )
            tokens = response["tokens"]
            if not tokens or any(
                type(token) is not int or token < 0 for token in tokens
            ):
                raise ValueError("Unexpected tokenizer response")
            write_json(output / "tokens.json", tokens)
    finally:
        native.adb(
            "pull",
            f"{native.REMOTE}/{server.log}",
            str(output / "server.log"),
            check=False,
        )
    counts = defaultdict(Counter)
    for i in range(2, len(tokens)):
        counts[tuple(tokens[i - 2 : i])][tokens[i]] += 1
    target = output / "structure-ngram-cache.bin"
    with target.open("wb") as stream:
        for prefix, successors in sorted(counts.items()):
            stream.write(struct.pack("<5i", *prefix, -1, -1, len(successors)))
            for token, count in sorted(successors.items()):
                stream.write(struct.pack("<2i", token, count))
    write_json(
        output / "manifest.json",
        {
            "serial": args.serial,
            "model": server.model,
            "schema_patterns": len(examples),
            "tokens": len(tokens),
            "entries": len(counts),
            "cache_bytes": target.stat().st_size,
            "cache_sha256": sha256(target),
            "scope": "Schema-only drafts; no transaction corpus, labels, training, or prompt changes; target verification required",
            "encoding": "Pinned llama.cpp b11669 common_ngram_cache little-endian int32 format, static n=2",
        },
    )
    print("Cache ready", len(examples), len(tokens), target.stat().st_size, flush=True)


if __name__ == "__main__":
    main()
