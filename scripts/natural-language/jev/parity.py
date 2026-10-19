"""Compare tokens and normalized embeddings on development-only compiled inputs."""

import argparse
import json
from pathlib import Path

import numpy as np
from decision import DecisionParser
from encoder import EmbeddingServer, ReferenceEncoder
from support import ARTIFACTS, HERE, baseline_evaluate, baseline_harness, write_json


class RecordingEncoder:
    def __init__(self, encoder):
        self.encoder = encoder
        self.records = {}

    def encode(self, texts):
        vectors = self.encoder.encode(texts)
        for text, vector in zip(texts, vectors):
            self.records[text] = {
                "tokens": self.encoder.tokenize(text),
                "embedding": vector,
            }
        return vectors


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference", action="store_true")
    ap.add_argument("--model")
    ap.add_argument("--device", action="store_true")
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    output = ARTIFACTS / "reports" / args.output
    output.mkdir(parents=True, exist_ok=False)
    reference_path = ARTIFACTS / "reference-vectors.json"
    if args.reference:
        encoder = RecordingEncoder(ReferenceEncoder())
        parser = DecisionParser(encoder)
        rows = baseline_evaluate.load_rows(HERE.parent / "data/dev.tsv")
        records = []
        # Every tenth row covers unrelated development groups without using test labels.
        for row in rows[::10]:
            actual = parser.parse(row["text"], baseline_harness.context_for(row))
            records.append({"expected": row, "actual": actual})
            print(f"Reference {len(records)}/10", flush=True)
        write_json(reference_path, encoder.records)
        write_json(output / "decisions.json", records)
        write_json(output / "summary.json", {"unique_texts": len(encoder.records)})
        return
    references = json.loads(reference_path.read_text(encoding="utf-8"))
    results = []
    if args.device:
        from device_benchmark import DeviceServer

        manager = DeviceServer(args.model)
    else:
        manager = EmbeddingServer(args.model)
    with manager as server:
        texts = list(references)
        vectors = server.encoder.encode(texts)
        for text, vector in zip(texts, vectors):
            expected = references[text]
            tokens = server.encoder.tokenize(text)
            left, right = np.array(vector), np.array(expected["embedding"])
            results.append(
                {
                    "text": text,
                    "tokens_match": tokens == expected["tokens"],
                    "actual_tokens": tokens,
                    "reference_tokens": expected["tokens"],
                    "cosine": float(
                        left @ right / (np.linalg.norm(left) * np.linalg.norm(right))
                    ),
                    "max_abs_error": float(np.max(np.abs(left - right))),
                }
            )
    write_json(output / "vectors.json", results)
    summary = {
        "model": str(Path(args.model).name),
        "count": len(results),
        "tokens_match": sum(row["tokens_match"] for row in results),
        "cosine_min": min(row["cosine"] for row in results),
        "cosine_mean": float(np.mean([row["cosine"] for row in results])),
        "cosine_p05": float(np.percentile([row["cosine"] for row in results], 5)),
        "max_abs_error": max(row["max_abs_error"] for row in results),
    }
    write_json(output / "summary.json", summary)
    print(json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
