"""Independent NumPy UIE reference and PyTorch/ONNX conversion diagnostics."""

import math

import numpy as np
import torch
from common import ARTIFACTS, HERE, read_json, write_json
from models import BGE, bge_tokenizer, load_uie, original_weights, uie_tokenizer
from runtime import INPUTS, decode_spans, session


def numpy_uie(weights, input_ids, token_type_ids, attention_mask):
    def linear(value, prefix):
        return value @ weights[prefix + ".weight"] + weights[prefix + ".bias"]

    def norm(value, prefix):
        centered = value - value.mean(axis=-1, keepdims=True)
        return (
            centered
            / np.sqrt((centered * centered).mean(axis=-1, keepdims=True) + 1e-12)
            * weights[prefix + ".weight"]
            + weights[prefix + ".bias"]
        )

    prefix = "ernie.embeddings."
    hidden = weights[prefix + "word_embeddings.weight"][input_ids]
    hidden = (
        hidden
        + weights[prefix + "position_embeddings.weight"][np.arange(input_ids.shape[1])]
    )
    hidden = hidden + weights[prefix + "token_type_embeddings.weight"][token_type_ids]
    hidden = hidden + weights[prefix + "task_type_embeddings.weight"][0]
    hidden = norm(hidden, prefix + "layer_norm")
    for index in range(4):
        prefix = f"ernie.encoder.layers.{index}."
        heads = [
            linear(hidden, prefix + "self_attn." + name)
            .reshape(hidden.shape[0], hidden.shape[1], 12, 32)
            .transpose(0, 2, 1, 3)
            for name in ("q_proj", "k_proj", "v_proj")
        ]
        query, key, value = heads
        scores = (query / math.sqrt(32)) @ key.transpose(0, 1, 3, 2)
        scores += (1 - attention_mask[:, None, None, :]) * -10000.0
        probabilities = np.exp(scores - scores.max(axis=-1, keepdims=True))
        probabilities /= probabilities.sum(axis=-1, keepdims=True)
        attention = (probabilities @ value).transpose(0, 2, 1, 3).reshape(hidden.shape)
        hidden = norm(
            hidden + linear(attention, prefix + "self_attn.out_proj"), prefix + "norm1"
        )
        intermediate = linear(hidden, prefix + "linear1")
        activated = (
            intermediate
            * 0.5
            * (
                1
                + np.vectorize(math.erf, otypes=[np.float32])(
                    intermediate / math.sqrt(2)
                )
            )
        )
        hidden = norm(hidden + linear(activated, prefix + "linear2"), prefix + "norm2")
    return tuple(
        1 / (1 + np.exp(-linear(hidden, name).squeeze(-1)))
        for name in ("linear_start", "linear_end")
    )


def signature(spans):
    return sorted(
        (row["segment"], row["start"], row["end"], row["text"]) for row in spans
    )


def main():
    torch.set_num_threads(4)
    examples = read_json(HERE / "data" / "parity.json")
    weights, model, tokenizer = original_weights(), load_uie(), uie_tokenizer()
    fp32, int8 = session("uie", "fp32"), session("uie", "int8")
    records = []
    for example in examples["uie"]:
        prompt, text = example["prompt"], example["text"]
        encoded = tokenizer(
            prompt, text, return_tensors="np", return_offsets_mapping=True
        )
        inputs = {key: encoded[key].astype(np.int64) for key in INPUTS}
        reference = numpy_uie(weights, **inputs)
        with torch.no_grad():
            pytorch = tuple(
                value.numpy()
                for value in model(
                    **{key: torch.from_numpy(value) for key, value in inputs.items()}
                )
            )
        floating, quantized = fp32.run(None, inputs), int8.run(None, inputs)
        spans = [
            signature(
                decode_spans(
                    encoded, out[0][0], out[1][0], prompt, text, example["threshold"]
                )
            )
            for out in (reference, pytorch, floating, quantized)
        ]
        records.append(
            {
                "id": example["id"],
                "numpy_torch_max_abs_error": max(
                    float(np.max(np.abs(a - b))) for a, b in zip(reference, pytorch)
                ),
                "torch_onnx_max_abs_error": max(
                    float(np.max(np.abs(a - b))) for a, b in zip(pytorch, floating)
                ),
                "fp32_int8_max_abs_error": max(
                    float(np.max(np.abs(a - b))) for a, b in zip(floating, quantized)
                ),
                "span_signatures": spans,
                "reference_spans_match": spans[0] == spans[1] == spans[2],
                "quantized_spans_match": spans[2] == spans[3],
            }
        )
    encoder, tokenizer = BGE().eval(), bge_tokenizer()
    fp32, int8 = session("bge", "fp32"), session("bge", "int8")
    embeddings = []
    for text in examples["embedding"]:
        encoded = tokenizer(text, return_tensors="np")
        inputs = {key: encoded[key].astype(np.int64) for key in INPUTS}
        with torch.no_grad():
            reference = encoder(
                **{key: torch.from_numpy(value) for key, value in inputs.items()}
            ).numpy()
        floating, quantized = fp32.run(None, inputs)[0], int8.run(None, inputs)[0]
        embeddings.append(
            {
                "torch_onnx_max_abs_error": float(np.max(np.abs(reference - floating))),
                "fp32_int8_cosine": float((floating * quantized).sum()),
            }
        )
    report = {
        "uie": records,
        "bge": embeddings,
        "reference_checks_passed": all(
            r["reference_spans_match"]
            and r["numpy_torch_max_abs_error"] < 1e-4
            and r["torch_onnx_max_abs_error"] < 1e-4
            for r in records
        )
        and all(r["torch_onnx_max_abs_error"] < 1e-4 for r in embeddings),
        "scope": "NumPy equations follow official Paddle UIE and use original untransposed weights. This is not an execution of PaddleNLP Taskflow or a JS/mobile tokenizer parity test.",
        "mobile_tokenizer_parity": "pending",
    }
    write_json(ARTIFACTS / "parity.json", report)
    print(report, flush=True)
    if not report["reference_checks_passed"]:
        raise SystemExit("Reference parity failed")


if __name__ == "__main__":
    main()
