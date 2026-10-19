"""Offline experiment adapter. Returns candidates only; has no persistence API."""

import numpy as np
import onnxruntime as ort
from common import ARTIFACTS, HERE, MODELS, digest, read_json
from money import parse_money
from transformers import AutoTokenizer

INPUTS = ("input_ids", "token_type_ids", "attention_mask")


def session(name, precision="int8"):
    filename = f"{name}.{precision}.onnx"
    expected = next(
        row
        for row in read_json(ARTIFACTS / "export-manifest.json")["files"]
        if row["file"] == filename
    )
    if digest(MODELS / filename) != expected["sha256"]:
        raise ValueError(f"Model checksum mismatch: {filename}")
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    options.inter_op_num_threads = 1
    return ort.InferenceSession(
        str(MODELS / filename), sess_options=options, providers=["CPUExecutionProvider"]
    )


def decode_spans(encoded, starts, ends, prompt, text, threshold):
    sequences = encoded.sequence_ids(0)
    offsets = encoded["offset_mapping"][0]
    candidates = []
    # Match each end to its nearest preceding start, as in UIE's span decoder.
    for segment, original in ((0, prompt), (1, text)):
        begin = [
            i
            for i, score in enumerate(starts)
            if score > threshold and sequences[i] == segment
        ]
        finish = [
            i
            for i, score in enumerate(ends)
            if score > threshold and sequences[i] == segment
        ]
        pairs = {}
        for start in begin:
            end = next((index for index in finish if index >= start), None)
            if end is not None:
                pairs[end] = start
        for end, start in pairs.items():
            left, right = int(offsets[start][0]), int(offsets[end][1])
            if left < right <= len(original):
                candidates.append(
                    {
                        "text": original[left:right],
                        "start": left,
                        "end": right,
                        "segment": "text" if segment else "prompt",
                        "score": float(starts[start] * ends[end]),
                    }
                )
    return sorted(candidates, key=lambda item: (-item["score"], item["start"]))


def amount_from(spans):
    values = [parse_money(span["text"]) for span in spans if span["segment"] == "text"]
    if len(values) != 1:
        return None
    return values[0]


def type_from(spans, labels):
    values = {
        labels[span["text"]]
        for span in spans
        if span["segment"] == "prompt" and span["text"] in labels
    }
    return next(iter(values)) if len(values) == 1 else None


def match_account(spans, accounts):
    matches = set()
    for span in spans:
        if span["segment"] != "text":
            continue
        for account in accounts:
            names = [account["name"], *account.get("aliases", [])]
            if account.get("active", True) and span["text"] in names:
                matches.add(account["id"])
    return next(iter(matches)) if len(matches) == 1 else None


class OfflineCandidate:
    def __init__(self, precision="int8", context=None):
        self.uie = session("uie", precision)
        self.bge = session("bge", precision)
        self.uie_tokenizer = AutoTokenizer.from_pretrained(
            MODELS / "uie-tokenizer", local_files_only=True
        )
        self.bge_tokenizer = AutoTokenizer.from_pretrained(
            MODELS / "bge-tokenizer", local_files_only=True
        )
        self.prompts = read_json(HERE / "data" / "prompts.json")
        self.context = context or read_json(HERE / "data" / "context.json")
        self.categories = [
            row for row in self.context["categories"] if not row.get("archived", False)
        ]
        by_id = {row["id"]: row for row in self.categories}
        descriptions = [
            " ".join(
                [
                    by_id.get(row.get("parentId"), {}).get("name", ""),
                    row["name"],
                    *row.get("examples", []),
                ]
            )
            for row in self.categories
        ]
        self.category_embeddings = np.concatenate(
            [self.embed(text) for text in descriptions]
        )

    def raw(self, prompt, text):
        encoded = self.uie_tokenizer(
            prompt,
            text,
            return_tensors="np",
            return_offsets_mapping=True,
            truncation=True,
            max_length=512,
        )
        starts, ends = self.uie.run(
            None, {key: encoded[key].astype(np.int64) for key in INPUTS}
        )
        return encoded, starts[0], ends[0]

    def extract(self, prompt, text, threshold):
        encoded, starts, ends = self.raw(prompt, text)
        return decode_spans(encoded, starts, ends, prompt, text, threshold)

    def embed(self, text):
        encoded = self.bge_tokenizer(
            text, return_tensors="np", truncation=True, max_length=512
        )
        return self.bge.run(
            None, {key: encoded[key].astype(np.int64) for key in INPUTS}
        )[0]

    def rank_categories(self, text, transaction_type):
        scores = self.category_embeddings @ self.embed(text)[0]
        return sorted(
            [
                {"id": row["id"], "score": float(scores[index])}
                for index, row in enumerate(self.categories)
                if row["type"] == transaction_type
            ],
            key=lambda row: (-row["score"], row["id"]),
        )

    def parse(self, text, config):
        if not text.strip() or len(text) > 200:
            raise ValueError("Input must contain 1 to 200 characters")
        amount_spans = self.extract(
            config["amount"]["prompt"], text, config["amount"]["threshold"]
        )
        type_spans = self.extract(
            config["type"]["prompt"], text, config["type"]["threshold"]
        )
        status_spans = self.extract(self.prompts["status"], text, 0.5)
        source_spans = self.extract(self.prompts["source_account"], text, 0.5)
        destination_spans = self.extract(self.prompts["destination_account"], text, 0.5)
        amount = amount_from(amount_spans)
        transaction_type = type_from(type_spans, self.prompts["type_labels"])
        candidates = self.rank_categories(text, transaction_type)
        source = match_account(source_spans, self.context["accounts"])
        destination = match_account(destination_spans, self.context["accounts"])
        status_values = {
            span["text"] for span in status_spans if span["segment"] == "prompt"
        }
        is_single = status_values == {self.prompts["single_label"]}
        unresolved = []
        for key, value in (
            ("amount", amount),
            ("type", transaction_type),
            ("category", candidates),
            ("account", source),
        ):
            if not value:
                unresolved.append(key)
        if not is_single:
            unresolved.append("transaction_status")
        if transaction_type == "transfer" and (
            not destination or source == destination
        ):
            unresolved.append("transfer_direction")
        return {
            "amount_cents": amount,
            "type": transaction_type,
            "category": candidates[0]["id"] if candidates else None,
            "source_account": source,
            "destination_account": destination,
            "status": "single" if is_single else "clarify",
            "unresolved": unresolved,
            "category_candidates": candidates[:3],
            "evidence": {
                "amount": amount_spans,
                "type": type_spans,
                "status": status_spans,
                "source_account": source_spans,
                "destination_account": destination_spans,
            },
        }
