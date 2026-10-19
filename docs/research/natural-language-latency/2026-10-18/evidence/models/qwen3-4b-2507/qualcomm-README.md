---
library_name: pytorch
license: apache-2.0
tags:
- llm
- generative_ai
- android
pipeline_tag: text-generation

---

![](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/qwen3_4b_instruct_2507/web-assets/model_demo.png)

# Qwen3-4B-Instruct-2507: Optimized for Qualcomm Devices

The Qwen3-4B-Instruct-2507 is a state-of-the-art multilingual instruct language model with 4 billion parameters, excelling in language understanding, generation, coding, and mathematics. Unlike the base Qwen3-4B, this variant has only instruct training without thinking mode support.

This is based on the implementation of Qwen3-4B-Instruct-2507 found [here](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507).
This repository contains pre-exported model files optimized for Qualcomm® devices. You can use the [Qualcomm® AI Hub Models](https://github.com/qualcomm/ai-hub-models/blob/v0.64.0/src/qai_hub_models/models/qwen3_4b_instruct_2507) library to export with custom configurations. More details on model performance across various devices, can be found [here](#performance-summary).

Qualcomm AI Hub Models uses [Qualcomm AI Hub Workbench](https://workbench.aihub.qualcomm.com) to compile, profile, and evaluate this model. [Sign up](https://myaccount.qualcomm.com/signup) to run these models on a hosted Qualcomm® device.

## Deploying Qwen3-4B-Instruct-2507 on-device

Follow the [GenieX quickstart](https://geniex.aihub.qualcomm.com/en/get-started/quickstart) to install GenieX and deploy the model on a target device.

See the [LLM-on-Genie](https://github.com/qualcomm/ai-hub-apps/tree/main/tutorials/llm_on_genie) tutorial to run with the Genie runtime. Note: Genie support will be deprecated soon.

## Getting Started
There are two ways to deploy this model on your device:

### Option 1: Download Pre-Exported Models

Below are pre-exported model assets ready for deployment.

| Runtime | Precision | Chipset | SDK Versions | Download |
|---|---|---|---|---|
| GENIE | w4a16 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | QAIRT 2.45 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/qwen3_4b_instruct_2507/releases/v0.64.0/qwen3_4b_instruct_2507-genie-w4a16-qualcomm_snapdragon_8_elite_gen5_for_galaxy.zip)
| GENIE | w4a16 | Snapdragon® 8 Elite For Galaxy Mobile | QAIRT 2.45 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/qwen3_4b_instruct_2507/releases/v0.64.0/qwen3_4b_instruct_2507-genie-w4a16-qualcomm_snapdragon_8_elite_for_galaxy.zip)
| GENIE | w4a16 | Snapdragon® X2 Elite | QAIRT 2.45 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/qwen3_4b_instruct_2507/releases/v0.64.0/qwen3_4b_instruct_2507-genie-w4a16-qualcomm_snapdragon_x2_elite.zip)
| GENIE | w4a16 | Snapdragon® X Elite | QAIRT 2.45 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/qwen3_4b_instruct_2507/releases/v0.64.0/qwen3_4b_instruct_2507-genie-w4a16-qualcomm_snapdragon_x_elite.zip)
| GENIE | w4a16 | Qualcomm® Dragonwing™ IQ-8275 | QAIRT 2.45 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/qwen3_4b_instruct_2507/releases/v0.64.0/qwen3_4b_instruct_2507-genie-w4a16-qualcomm_qcs8275.zip)
| GENIE | w4a16 | Qualcomm® SA8775P | QAIRT 2.45 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/qwen3_4b_instruct_2507/releases/v0.64.0/qwen3_4b_instruct_2507-genie-w4a16-qualcomm_sa8775p.zip)
| GENIE | w4a16 | Qualcomm® Dragonwing™ IQ-9075 | QAIRT 2.45 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/qwen3_4b_instruct_2507/releases/v0.64.0/qwen3_4b_instruct_2507-genie-w4a16-qualcomm_qcs9075.zip)
| GENIEX_LLAMACPP | q4_0 | Universal |  | [Download](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_0.gguf)
| GENIEX_QAIRT | w4a16 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | QAIRT 2.45 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/qwen3_4b_instruct_2507/releases/v0.64.0/qwen3_4b_instruct_2507-geniex_qairt-w4a16-qualcomm_snapdragon_8_elite_gen5_for_galaxy.zip)
| GENIEX_QAIRT | w4a16 | Snapdragon® 8 Elite For Galaxy Mobile | QAIRT 2.45 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/qwen3_4b_instruct_2507/releases/v0.64.0/qwen3_4b_instruct_2507-geniex_qairt-w4a16-qualcomm_snapdragon_8_elite_for_galaxy.zip)
| GENIEX_QAIRT | w4a16 | Snapdragon® X2 Elite | QAIRT 2.45 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/qwen3_4b_instruct_2507/releases/v0.64.0/qwen3_4b_instruct_2507-geniex_qairt-w4a16-qualcomm_snapdragon_x2_elite.zip)
| GENIEX_QAIRT | w4a16 | Snapdragon® X Elite | QAIRT 2.45 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/qwen3_4b_instruct_2507/releases/v0.64.0/qwen3_4b_instruct_2507-geniex_qairt-w4a16-qualcomm_snapdragon_x_elite.zip)
| GENIEX_QAIRT | w4a16 | Qualcomm® Dragonwing™ IQ-8275 | QAIRT 2.45 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/qwen3_4b_instruct_2507/releases/v0.64.0/qwen3_4b_instruct_2507-geniex_qairt-w4a16-qualcomm_qcs8275.zip)
| GENIEX_QAIRT | w4a16 | Qualcomm® Dragonwing™ IQ-9075 | QAIRT 2.45 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/qwen3_4b_instruct_2507/releases/v0.64.0/qwen3_4b_instruct_2507-geniex_qairt-w4a16-qualcomm_qcs9075.zip)

For more device-specific assets and performance metrics, visit **[Qwen3-4B-Instruct-2507 on Qualcomm® AI Hub](https://aihub.qualcomm.com/models/qwen3_4b_instruct_2507)**.


### Option 2: Export with Custom Configurations

Use the [Qualcomm® AI Hub Models](https://github.com/qualcomm/ai-hub-models/blob/v0.64.0/src/qai_hub_models/models/qwen3_4b_instruct_2507) Python library to compile and export the model with your own:
- Custom weights (e.g., fine-tuned checkpoints)
- Custom input shapes
- Target device and runtime configurations

This option is ideal if you need to customize the model beyond the default configuration provided here.

See our repository for [Qwen3-4B-Instruct-2507 on GitHub](https://github.com/qualcomm/ai-hub-models/blob/v0.64.0/src/qai_hub_models/models/qwen3_4b_instruct_2507) for usage instructions.

## Model Details

**Model Type:** Model_use_case.text_generation

**Model Stats:**
- Response Rate: Rate of response generation after the first response token. Measured on a short prompt with a long response; may slow down when using longer context lengths.
- Supported languages: 100+ languages and dialects.
- TTFT: Time To First Token is the time it takes to generate the first response token. This is expressed as a range because it varies based on the length of the prompt. The lower bound is for a short prompt (up to 128 tokens, i.e., one iteration of the prompt processor) and the upper bound is for a prompt using the full context length (4096 tokens).

## Performance Summary
| Model | Runtime | Precision | Chipset | Context Length | Response Rate (tokens per second) | Time To First Token (range, seconds)
|---|---|---|---|---|---|---
| Qwen3-4B-Instruct-2507 | GENIE | w4a16 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 4096 | 27.985336303710938 | 0.05547 - 1.77504
| Qwen3-4B-Instruct-2507 | GENIE | w4a16 | Snapdragon® 8 Elite For Galaxy Mobile | 4096 | 26.66240119934082 | 0.065065 - 2.08208
| Qwen3-4B-Instruct-2507 | GENIE | w4a16 | Snapdragon® X2 Elite | 4096 | 32.163973808288574 | 0.07509 - 2.40288
| Qwen3-4B-Instruct-2507 | GENIE | w4a16 | Snapdragon® X Elite | 4096 | 8.30799388885498 | 0.10081799999999999 - 3.2261759999999997
| Qwen3-4B-Instruct-2507 | GENIE | w4a16 | Qualcomm® Dragonwing™ IQ-8275 | 4096 | 18.114301681518555 | 0.094182 - 3.013824
| Qwen3-4B-Instruct-2507 | GENIE | w4a16 | Qualcomm® Dragonwing™ IQ-9075 | 4096 | 19.92993297576904 | 0.10179260000000001 - 3.2573632000000003
| Qwen3-4B-Instruct-2507 | GENIE | w4a16 | Qualcomm® Dragonwing™ IQ-X7181 | 4096 | 8.30799388885498 | 0.10081799999999999 - 3.2261759999999997
| Qwen3-4B-Instruct-2507 | GENIE | w4a16 | Qualcomm® Dragonwing™ Q-8750 | 4096 | 26.66240119934082 | 0.065065 - 2.08208
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 512 | 19.697929 | 1.3546813333333332 - 5.418725333333333
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 512 | 21.139921 | 0.4971393333333333 - 1.9885573333333333
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 512 | 22.245684 | 0.10473666666666664 - 0.4189466666666666
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 4096 | 6.223475 | 2.981126161290322 - 95.39603716129031
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 4096 | 12.660195 | 1.1085383548387098 - 35.47322735483871
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 4096 | 11.399435 | 0.13752932258064515 - 4.400938322580645
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® 8 Elite For Galaxy Mobile | 512 | 21.303923 | 1.157875 - 4.6315
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® 8 Elite For Galaxy Mobile | 512 | 20.209841 | 0.5405866666666665 - 2.162346666666666
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® 8 Elite For Galaxy Mobile | 512 | 17.073282 | 0.12675333333333333 - 0.5070133333333333
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® 8 Elite For Galaxy Mobile | 4096 | 4.981844 | 3.0638862258064514 - 98.04435922580645
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® 8 Elite For Galaxy Mobile | 4096 | 10.070317 | 1.4112917741935482 - 45.16133677419354
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® 8 Elite For Galaxy Mobile | 4096 | 8.015922 | 0.2074222580645161 - 6.637512258064516
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® X2 Elite | 512 | 36.120735 | 0.2838346666666666 - 1.1353386666666665
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® X2 Elite | 512 | 20.878213 | 0.2478723333333333 - 0.9914893333333332
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® X2 Elite | 512 | 20.247206 | 0.09196233333333334 - 0.36784933333333336
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® X2 Elite | 4096 | 21.111574 | 0.5152424838709677 - 16.487759483870967
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® X2 Elite | 4096 | 16.904976 | 0.48492470967741935 - 15.51759070967742
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® X2 Elite | 4096 | 13.051477 | 0.12212519354838709 - 3.908006193548387
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® X Elite | 512 | 28.265948 | 0.6946986666666667 - 2.7787946666666667
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® X Elite | 512 | 24.221611 | 0.5377303333333333 - 2.1509213333333332
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® X Elite | 512 | 12.497374 | 0.22211166666666668 - 0.8884466666666667
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® X Elite | 4096 | 7.389816 | 1.344167612903226 - 43.013363612903234
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® X Elite | 4096 | 13.675057 | 1.2736976451612902 - 40.75832464516129
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Snapdragon® X Elite | 4096 | 7.03239 | 0.3106614193548387 - 9.941165419354839
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-8275 | 512 | 3.893702 | 15.624039 - 62.496156
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-8275 | 512 | 2.531282 | 22.960773 - 91.843092
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-8275 | 512 | 9.150978 | 1.254424 - 5.017696
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-8275 | 4096 | 1.183452 | 182.75677299999998 - 5848.216735999999
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-8275 | 4096 | 1.931728 | 283.875829 - 9084.026528
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-8275 | 4096 | 4.943807 | 12.994411 - 415.821152
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-9075 | 512 | 16.567456 | 6.919445 - 27.67778
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-9075 | 512 | 7.925028 | 7.833494 - 31.333976
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-9075 | 512 | 11.404724 | 1.142653 - 4.570612
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-X7181 | 512 | 28.265948 | 0.6946986666666667 - 2.7787946666666667
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-X7181 | 512 | 24.221611 | 0.5377303333333333 - 2.1509213333333332
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-X7181 | 512 | 12.497374 | 0.22211166666666668 - 0.8884466666666667
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ Q-8750 | 512 | 21.303923 | 1.157875 - 4.6315
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ Q-8750 | 512 | 20.209841 | 0.5405866666666665 - 2.162346666666666
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ Q-8750 | 512 | 17.073282 | 0.12675333333333333 - 0.5070133333333333
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-9075 | 4096 | 10.592799 | 87.13177999999999 - 2788.2169599999997
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-9075 | 4096 | 5.71345 | 100.728905 - 3223.32496
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-9075 | 4096 | 5.810914 | 12.2403 - 391.6896
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-X7181 | 4096 | 7.389816 | 1.344167612903226 - 43.013363612903234
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-X7181 | 4096 | 13.675057 | 1.2736976451612902 - 40.75832464516129
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ IQ-X7181 | 4096 | 7.03239 | 0.3106614193548387 - 9.941165419354839
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ Q-8750 | 4096 | 4.981844 | 3.0638862258064514 - 98.04435922580645
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ Q-8750 | 4096 | 10.070317 | 1.4112917741935482 - 45.16133677419354
| Qwen3-4B-Instruct-2507 | GENIEX_LLAMACPP | q4_0 | Qualcomm® Dragonwing™ Q-8750 | 4096 | 8.015922 | 0.2074222580645161 - 6.637512258064516
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 512 | 17.024301 | 0.08906033333333332 - 0.3562413333333333
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 1024 | 15.810341 | 0.092818 - 0.742544
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 2048 | 13.337368 | 0.10240906666666666 - 1.6385450666666665
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 3072 | 12.53338 | 0.11044921739130434 - 2.650781217391304
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 4096 | 11.425286 | 0.12383183870967741 - 3.9626188387096772
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Snapdragon® 8 Elite For Galaxy Mobile | 512 | 17.254415 | 0.091904 - 0.367616
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Snapdragon® 8 Elite For Galaxy Mobile | 1024 | 15.960709 | 0.10345585714285714 - 0.8276468571428571
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Snapdragon® 8 Elite For Galaxy Mobile | 2048 | 15.015873 | 0.10949759999999999 - 1.7519615999999998
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Snapdragon® 8 Elite For Galaxy Mobile | 3072 | 14.223588 | 0.1146168695652174 - 2.750804869565217
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Snapdragon® 8 Elite For Galaxy Mobile | 4096 | 13.424662 | 0.1365795483870968 - 4.370545548387097
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Snapdragon® X2 Elite | 4096 | 42.6465 | 0.045206 - 1.446592
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Snapdragon® X Elite | 4096 | 22.612881 | 0.098676 - 3.157632
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Qualcomm® Dragonwing™ IQ-8275 | 4096 | 17.863496 | 0.09899 - 3.16768
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Qualcomm® Dragonwing™ Q-8750 | 512 | 17.254415 | 0.091904 - 0.367616
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Qualcomm® Dragonwing™ Q-8750 | 1024 | 15.960709 | 0.10345585714285714 - 0.8276468571428571
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Qualcomm® Dragonwing™ Q-8750 | 2048 | 15.015873 | 0.10949759999999999 - 1.7519615999999998
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Qualcomm® Dragonwing™ Q-8750 | 3072 | 14.223588 | 0.1146168695652174 - 2.750804869565217
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Qualcomm® Dragonwing™ IQ-9075 | 4096 | 19.836973 | 0.09678 - 3.09696
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Qualcomm® Dragonwing™ IQ-X7181 | 4096 | 22.612881 | 0.098676 - 3.157632
| Qwen3-4B-Instruct-2507 | GENIEX_QAIRT | w4a16 | Qualcomm® Dragonwing™ Q-8750 | 4096 | 13.424662 | 0.1365795483870968 - 4.370545548387097

## License
* The license for the original implementation of Qwen3-4B-Instruct-2507 can be found
  [here](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/blob/main/LICENSE).

## References
* [Qwen3 Technical Report](https://arxiv.org/abs/2505.09388)
* [Source Model Implementation](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507)

## Community
* Join [our AI Hub Slack community](https://aihub.qualcomm.com/community/slack) to collaborate, post questions and learn more about on-device AI.
* For questions or feedback please [reach out to us](mailto:ai-hub-support@qti.qualcomm.com).

## Usage and Limitations

This model may not be used for or in connection with any of the following applications:

- Accessing essential private and public services and benefits;
- Administration of justice and democratic processes;
- Assessing or recognizing the emotional state of a person;
- Biometric and biometrics-based systems, including categorization of persons based on sensitive characteristics;
- Education and vocational training;
- Employment and workers management;
- Exploitation of the vulnerabilities of persons resulting in harmful behavior;
- General purpose social scoring;
- Law enforcement;
- Management and operation of critical infrastructure;
- Migration, asylum and border control management;
- Predictive policing;
- Real-time remote biometric identification in public spaces;
- Recommender systems of social media platforms;
- Scraping of facial images (from the internet or otherwise); and/or
- Subliminal manipulation
