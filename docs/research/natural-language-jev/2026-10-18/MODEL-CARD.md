---
base_model: Qwen/Qwen3-Embedding-0.6B
datasets:
- HIT-TMG/JevEmbed-Data
pipeline_tag: feature-extraction
library_name: sentence-transformers
tags:
- jevembed
license: apache-2.0
---

# JevEmbed-Qwen3-Embedding-0.6B

This [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) checkpoint was fine-tuned with LoRA on all 1,601,157 training questions in [JevEmbed-Data](https://huggingface.co/datasets/HIT-TMG/JevEmbed-Data), then merged for standalone use. The adapter is also available in [`lora/`](lora/).

The model produces 1,024-dimensional embeddings. [JevEmbed](https://github.com/HITsz-TMG/JevEmbed) applies the prompts and scoring in [`jevembed.yaml`](jevembed.yaml) to make Choice, Score, and Noul decisions. The release was tested with `transformers==4.51.0` and `sentence-transformers==5.3.0`.

## Use with JevEmbed

Install JevEmbed, then run the CLI from this model directory (`model_name_or_path: .`):

```bash
cd /path/to/JevEmbed-Qwen3-Embedding-0.6B
python -m jevembed --config jevembed.yaml --input request.json
```

For Python, resolve the model directory explicitly:

```python
import json
from dataclasses import replace
from pathlib import Path
from jevembed import JevEmbed, ModelConfig

model_dir = Path("/path/to/JevEmbed-Qwen3-Embedding-0.6B").resolve()
config = replace(ModelConfig.load(model_dir / "jevembed.yaml"), model_name_or_path=str(model_dir))
client = JevEmbed(config=config)
request = json.loads((model_dir / "request.json").read_text())
response = client.evaluate(request)
```

The configuration uses a 1,024-token limit with truncation, Choice/Score temperature 0.1, and Noul slope 10. For raw embeddings, load the merged model with `SentenceTransformer(model_dir)`.

## Test-set performance

The base and released merged model were evaluated on the same **66,482** questions in the JevEmbed-Data `test` split, using BF16, the same prompts and scoring, and 1,024-token truncation. Accuracy uses hard labels; MAE also includes soft targets where present.

| Metric | Base | After LoRA fine-tuning (merged) | Change |
| --- | ---: | ---: | ---: |
| Overall hard-label accuracy (64,110) | 33.79% | 82.30% | +48.51 pp |
| Choice accuracy (17,487) | 33.02% | 84.53% | +51.51 pp |
| Score level accuracy (24,260) | 28.56% | 69.55% | +40.99 pp |
| Noul binary accuracy (22,363) | 40.05% | 94.38% | +54.33 pp |
| Score MAE (24,287; lower is better) | 1.0107 | 0.4313 | -0.5793 |
| Noul MAE (24,004; lower is better) | 0.5928 | 0.0878 | -0.5050 |

The saved merged model's embeddings matched the LoRA-loaded model within 6.9 × 10⁻⁷ maximum absolute difference on five inputs; see [`MERGE_MANIFEST.json`](MERGE_MANIFEST.json).

## Training

One epoch on **1,601,157** questions used 16 GPUs across four nodes, per-GPU batch 16, accumulation 2 (effective batch 512), BF16, LoRA rank 64, alpha 32, dropout 0.05, Q/K/V targets, learning rate 2 × 10⁻⁴, and 10% warmup. Inputs were truncated at 1,024 tokens. The final adapter is step 3,128.

Training minimizes the mean per-question loss: cross-entropy over cosine-similarity logits for Choice and categorical Score, normalized squared error for continuous Score, and binary cross-entropy with logits for Noul. The implementation is [here](https://github.com/HITsz-TMG/JevEmbed/blob/main/src/jevembed/training/objective.py). Training-data source licenses vary; see the dataset's [source report](https://huggingface.co/datasets/HIT-TMG/JevEmbed-Data/blob/main/docs/PROCESSING_REPORT.md).

## Test-set examples

These are the same JevEmbed-Data game cases used in the [JevEmbed-KaLM-Embedding-V2.5 model card](https://huggingface.co/HIT-TMG/JevEmbed-KaLM-Embedding-V2.5), evaluated again with this release.

### Choice: target tracking in Doom

The player faces a visible Cacodemon 8.89° off center. The test label is `Strafe left` (ID `openjev:vizdoom-basic-v1:190919:id:205:0:choice`).

![Top-down Doom view with Strafe left selected and a 0.7404 probability](assets/jevembed-doom-tracking-choice.png)

Save this request as `request.json`:

```json
{
  "state": {
    "action_window_tics": 4,
    "ammo": 50.0,
    "elapsed_tics": 14,
    "health": 100.0,
    "movement": {
      "forward_units_per_tic": 0.0,
      "lateral_units_per_tic": 0.0
    },
    "nearest_visible_enemy": {
      "distance_units": 388.67414,
      "name": "Cacodemon",
      "relative_bearing_deg": 8.894711
    },
    "player": {
      "heading_deg": 0.0,
      "x_units": -384.0,
      "y_units": 32.0
    },
    "visible_enemy_count": 1
  },
  "questions": {
    "decision": {
      "type": "choice",
      "instructions": "Which lateral movement does the momentum-aware tracking policy choose to align with the nearest visible target?",
      "criteria": {
        "Strafe left": null,
        "Strafe right": null,
        "Hold lateral movement": null
      }
    }
  },
  "model": "jevembed-qwen3-embedding-0.6b"
}
```

JevEmbed-Qwen3-Embedding-0.6B selects **Strafe left**, matching the test label:

| Strafe left | Strafe right | Hold lateral movement |
| ---: | ---: | ---: |
| 0.7404 | 0.1141 | 0.1455 |

### Score: lining up a Doom shot

Three states from one Doom sequence show the enemy moving closer to the crosshair. The ordered levels 0–4 rate shot alignment, not game reward.

![Three Doom frames: the model predicts levels 2, 4, and 4; level 4 at tick 34 misses the test label 3](assets/jevembed-doom-shot-score.png)

The final frame (ID `openjev:vizdoom-basic-v1:190919:id:55:7:score`) is a runnable request:

```json
{
  "state": {
    "action_window_tics": 4,
    "ammo": 50.0,
    "elapsed_tics": 42,
    "health": 100.0,
    "movement": {
      "forward_units_per_tic": 0.0,
      "lateral_units_per_tic": 0.690659
    },
    "nearest_visible_enemy": {
      "distance_units": 384.176958,
      "name": "Cacodemon",
      "relative_bearing_deg": 1.739094
    },
    "player": {
      "heading_deg": 0.0,
      "x_units": -384.0,
      "y_units": 120.630661
    },
    "visible_enemy_count": 1
  },
  "questions": {
    "decision": {
      "type": "score",
      "instructions": "Rate the current shot alignment using the supplied ordered suitability grades. These grades are an aiming heuristic, not expected game reward.",
      "criteria": [
        "Cannot usefully aim a shot: no live visible target, no ammunition, dead player, or absolute target bearing above 22 degrees.",
        "Very poor alignment: live visible target and ammunition, player alive, absolute target bearing above 12 and at most 22 degrees.",
        "Coarse alignment: live visible target and ammunition, player alive, absolute target bearing above 6 and at most 12 degrees.",
        "Near alignment: live visible target and ammunition, player alive, absolute target bearing above 3 and at most 6 degrees.",
        "Aligned for the script's shot: live visible target and ammunition, player alive, absolute target bearing at most 3 degrees."
      ]
    }
  },
  "model": "jevembed-qwen3-embedding-0.6b"
}
```

| Game tick | Relative bearing | Test level | Model level | Probability of model level |
| ---: | ---: | ---: | ---: | ---: |
| 26 | 8.57° | 2 | 2 | 0.6063 |
| 34 | 3.05° | 3 | 4 | 0.7798 |
| 42 | 1.74° | 4 | 4 | 0.8314 |

The model overestimates alignment at tick 34; the other two levels match the test labels.

### Noul: moving into the snake's tail

Moving up enters the tail's current cell. The snake does not eat food on this move, so the tail vacates the cell and the test label is **no collision** (ID `openjev:snake-v1:677b4c40f40fd3be2ca642ed:collision_up`).

![Snake board showing the tail vacating as the model assigns a 0.2878 probability of collision](assets/jevembed-snake-tail-noul.png)

```json
{
  "state": {
    "coordinates": "x increases right; y increases down; walls are outside the board",
    "direction": "right",
    "food": [
      3,
      2
    ],
    "game": "snake",
    "height": 6,
    "snake_head_first": [
      [
        1,
        1
      ],
      [
        0,
        1
      ],
      [
        0,
        0
      ],
      [
        1,
        0
      ]
    ],
    "width": 6
  },
  "questions": {
    "decision": {
      "type": "noul",
      "instructions": "Will moving up cause an immediate wall or body collision? The tail vacates unless food is eaten."
    }
  },
  "model": "jevembed-qwen3-embedding-0.6b"
}
```

JevEmbed-Qwen3-Embedding-0.6B returns **0.2878** for the probability of a collision.


## Citation

If you find JevEmbed-Qwen3-Embedding-0.6B useful, please consider citing the following papers:

```bibtex
@misc{zhao2025kalmembeddingv2,
      title={KaLM-Embedding-V2: Superior Training Techniques and Data Inspire A Versatile Embedding Model},
      author={Xinping Zhao and Xinshuo Hu and Zifei Shan and Shouzheng Huang and Yao Zhou and Xin Zhang and Zetian Sun and Zhenyu Liu and Dongfang Li and Xinyuan Wei and Youcheng Pan and Yang Xiang and Meishan Zhang and Haofen Wang and Jun Yu and Baotian Hu and Min Zhang},
      year={2025},
      eprint={2506.20923},
      archivePrefix={arXiv},
      primaryClass={cs.CL},
      url={https://arxiv.org/abs/2506.20923},
}

@misc{hu2025kalmembedding,
      title={KaLM-Embedding: Superior Training Data Brings A Stronger Embedding Model},
      author={Xinshuo Hu and Zifei Shan and Xinping Zhao and Zetian Sun and Zhenyu Liu and Dongfang Li and Shaolin Ye and Xinyuan Wei and Qian Chen and Baotian Hu and Haofen Wang and Jun Yu and Min Zhang},
      year={2025},
      eprint={2501.01028},
      archivePrefix={arXiv},
      primaryClass={cs.CL},
      url={https://arxiv.org/abs/2501.01028},
}
```