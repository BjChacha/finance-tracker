"""Explicit UIE weight mapping; no downloaded Python code is executed."""

import pickle
import re

import numpy as np
import torch
from common import SOURCES, read_json, verify_sources
from transformers import (
    AutoModel,
    AutoTokenizer,
    BertTokenizerFast,
    ErnieConfig,
    ErnieModel,
)


class ArrayUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        if (module, name) in {
            ("numpy.core.multiarray", "_reconstruct"),
            ("numpy._core.multiarray", "_reconstruct"),
            ("numpy", "ndarray"),
            ("numpy", "dtype"),
        }:
            return super().find_class(module, name)
        raise pickle.UnpicklingError(f"Unexpected weight object: {module}.{name}")


def original_weights():
    verify_sources()
    with (SOURCES / "uie.pdparams").open("rb") as stream:
        return ArrayUnpickler(stream).load()


class UIE(torch.nn.Module):
    def __init__(self):
        super().__init__()
        config = ErnieConfig(**read_json(SOURCES / "uie-config.json"))
        config._attn_implementation = "eager"
        self.ernie = ErnieModel(config)
        self.linear_start = torch.nn.Linear(config.hidden_size, 1)
        self.linear_end = torch.nn.Linear(config.hidden_size, 1)

    def forward(self, input_ids, token_type_ids, attention_mask):
        mask = (1.0 - attention_mask[:, None, None, :].float()) * -10000.0
        hidden = self.ernie(
            input_ids=input_ids, token_type_ids=token_type_ids, attention_mask=mask
        ).last_hidden_state
        return self.linear_start(hidden).squeeze(-1).sigmoid(), self.linear_end(
            hidden
        ).squeeze(-1).sigmoid()


def load_uie():
    model = UIE()
    converted = {}
    substitutions = {
        "self_attn.q_proj": "attention.self.query",
        "self_attn.k_proj": "attention.self.key",
        "self_attn.v_proj": "attention.self.value",
        "self_attn.out_proj": "attention.output.dense",
        "norm1": "attention.output.LayerNorm",
        "linear1": "intermediate.dense",
        "linear2": "output.dense",
        "norm2": "output.LayerNorm",
    }
    for key, value in original_weights().items():
        if key == "StructuredToParameterName@@":
            continue
        target = key.replace("embeddings.layer_norm", "embeddings.LayerNorm")
        target = re.sub(r"encoder\.layers\.(\d+)\.", r"encoder.layer.\1.", target)
        for old, new in substitutions.items():
            target = target.replace(old, new)
        # Paddle Linear stores [in, out]; embeddings and layer norms are unchanged.
        if value.ndim == 2 and "embeddings" not in key:
            value = value.T
        converted[target] = torch.from_numpy(np.array(value, copy=True))
    model.load_state_dict(converted, strict=True)
    return model.eval()


def uie_tokenizer():
    return BertTokenizerFast(vocab=str(SOURCES / "uie-vocab.txt"), do_lower_case=True)


class BGE(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(
            SOURCES / "bge", local_files_only=True, attn_implementation="eager"
        )

    def forward(self, input_ids, token_type_ids, attention_mask):
        mask = (1.0 - attention_mask[:, None, None, :].float()) * -10000.0
        hidden = self.encoder(
            input_ids=input_ids, token_type_ids=token_type_ids, attention_mask=mask
        ).last_hidden_state
        return torch.nn.functional.normalize(hidden[:, 0], p=2, dim=1)


def bge_tokenizer():
    return AutoTokenizer.from_pretrained(SOURCES / "bge", local_files_only=True)
