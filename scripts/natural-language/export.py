"""Export FP32 and dynamic INT8 candidates, retaining a separate reference."""

import importlib.metadata
import shutil
import warnings

import onnx
import torch
from common import ARTIFACTS, MODELS, SOURCES, digest, write_json
from models import BGE, bge_tokenizer, load_uie, uie_tokenizer
from onnxruntime.quantization import QuantType, quantize_dynamic


def main():
    torch.set_num_threads(4)
    MODELS.mkdir(parents=True, exist_ok=True)
    files = []
    for name, model, tokenizer in [
        ("uie", load_uie(), uie_tokenizer()),
        ("bge", BGE().eval(), bge_tokenizer()),
    ]:
        encoded = tokenizer(
            "reference", "sample" if name == "uie" else None, return_tensors="pt"
        )
        inputs = ("input_ids", "token_type_ids", "attention_mask")
        outputs = ("start_prob", "end_prob") if name == "uie" else ("embedding",)
        axes = {key: {0: "batch", 1: "sequence"} for key in inputs}
        axes.update(
            {
                key: {0: "batch", **({1: "sequence"} if name == "uie" else {})}
                for key in outputs
            }
        )
        fp32 = MODELS / f"{name}.fp32.onnx"
        int8 = MODELS / f"{name}.int8.onnx"
        with torch.no_grad(), warnings.catch_warnings():
            warnings.simplefilter("ignore", torch.jit.TracerWarning)
            torch.onnx.export(
                model,
                tuple(encoded[key] for key in inputs),
                fp32,
                input_names=list(inputs),
                output_names=list(outputs),
                dynamic_axes=axes,
                opset_version=17,
                dynamo=False,
            )
        onnx.checker.check_model(str(fp32))
        # Gather quantization also compresses vocabulary embeddings, the largest UIE tensor.
        quantize_dynamic(
            str(fp32),
            str(int8),
            weight_type=QuantType.QInt8,
            per_channel=True,
            op_types_to_quantize=["MatMul", "Gather"],
        )
        onnx.checker.check_model(str(int8))
        for path in (fp32, int8):
            files.append(
                {
                    "file": path.name,
                    "bytes": path.stat().st_size,
                    "sha256": digest(path),
                }
            )
        tokenizer.save_pretrained(MODELS / f"{name}-tokenizer")
        print(f"Exported {name}: {int8.stat().st_size:,} bytes INT8", flush=True)
    shutil.copy2(SOURCES / "bge" / "README.md", MODELS / "bge-model-card.md")
    for name in ("uie-license.txt", "bge-license.txt"):
        shutil.copy2(SOURCES / name, MODELS / name)
    write_json(
        ARTIFACTS / "export-manifest.json",
        {
            "files": files,
            "packages": {
                name: importlib.metadata.version(name)
                for name in [
                    "torch",
                    "transformers",
                    "numpy",
                    "onnx",
                    "onnxruntime",
                    "safetensors",
                    "tokenizers",
                ]
            },
            "quantization": "dynamic QInt8 MatMul and Gather, per_channel=True",
            "mobile_validation": "pending",
        },
    )


if __name__ == "__main__":
    main()
