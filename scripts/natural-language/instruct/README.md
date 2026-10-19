# 本地指令模型 harness 实验

当前候选未达到产品接入门槛。完整结果见 [评测报告](../../../docs/research/natural-language-instruct/2026-10-18/report.md)。本目录是独立模型实验，不是应用内的一句话记账功能。

使用 LFM2.5-350M、llama.cpp b11669、提示词、候选枚举约束解码和独立业务校验。没有在线推理服务，没有本项目微调。imatrix只做量化校准，不进行梯度训练。

## 文件职责

- `fetch.py` / `sources.json`：固定版本下载与SHA256校验，仅准备阶段联网。
- `quantize.py`：从官方F16重现校准与混合量化，不覆盖已评测权重。
- `harness.py`：整数分金额候选、动态账户/分类枚举、有限空白GBNF、结构与业务校验。正则只列金额候选，由模型选择。模块不写数据库。
- `runner.py`：loopback推理和受控进程生命周期。冻结协议使用 `prompt-selected.txt`，温度0、seed42、192 token输出上限。
- `evaluate.py`：分别统计结构、业务一致性、预览完整度和语义；失败、弃权、整体业务拒绝保留在分母中。
- `android_benchmark.py`：进程冷启动、常驻模型请求、PSS采样与Perfetto，仅控制本脚本创建的进程和转发。
- `analyze_trace.py`：按测量记录中的PID提取调度证据。
- `heldout-scenarios.json` / `build_holdout.py` / `heldout.tsv`：200条新合成样例，40个模板各5条，**待人工核验**。
- `freeze.json`：新测试推理前冻结的代码、提示、上下文和数据哈希。
- 其他提示文件和 `examples.json`：开发对照，不能与冻结结果混用。

`preview`只表示通过当前机械校验，不保证语义正确。账户缺失时待补充，同名账户不猜测。

## 桌面重现

从仓库根目录，在新准备的实验环境执行。Python参考版本3.14。模型和大文件进入gitignored的 `artifacts/natural-language-instruct`。

```powershell
python -m pip install -r scripts/natural-language/instruct/requirements.txt
python scripts/natural-language/instruct/fetch.py --android
python scripts/natural-language/instruct/quantize.py --calibrate
python -m unittest discover -s scripts/natural-language/instruct -p test_harness.py
python scripts/natural-language/instruct/evaluate.py --model artifacts/natural-language-instruct/models/LFM2.5-350M-Q2_K_S-emb4.gguf --data scripts/natural-language/instruct/heldout.tsv --output reproduced-heldout --no-examples --prompt scripts/natural-language/instruct/prompt-selected.txt
python scripts/natural-language/instruct/evaluate.py --model artifacts/natural-language-instruct/models/LFM2.5-350M-Q2_K_S-emb4.gguf --data scripts/natural-language/instruct/dev-control.tsv --output reproduced-unconstrained --no-examples --unconstrained --prompt scripts/natural-language/instruct/prompt-selected.txt
```

输出目录必须是新名称。`build_holdout.py`只重现既有语料；不能根据测试结果改提示后继续声称同一次独立测试。

## 真机重现

调试服务仅绑定手机loopback，它不是线上API，也不是最终应用集成方案。

```powershell
$adbPath = 'C:\Users\bjcha\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adbPath -s 57721e63 shell mkdir -p /data/local/tmp/finance-nl-bench/runtime
& $adbPath -s 57721e63 push artifacts/natural-language-instruct/android-runtime/llama-b11669/. /data/local/tmp/finance-nl-bench/runtime/
& $adbPath -s 57721e63 shell chmod 755 /data/local/tmp/finance-nl-bench/runtime/llama-server
& $adbPath -s 57721e63 push artifacts/natural-language-instruct/models/LFM2.5-350M-Q2_K_S-emb4.gguf /data/local/tmp/finance-nl-bench/model-q2s-emb4.gguf
python scripts/natural-language/instruct/android_benchmark.py --model model-q2s-emb4.gguf --output reproduced-android --prompt scripts/natural-language/instruct/prompt-selected.txt --cold-runs 20 --warm-runs 60 --trace
```

冷启动重建进程与KV状态，不清理Android文件页缓存。热解析允许共享前缀缓存。耗时包含USB转发、请求与Python校验。PSS为隔离原生进程总量，不是React Native应用增量。

## 验证边界

合约检查覆盖金额精度、原文位置、重复键、非法ID、同名账户、分类类型冲突、转账方向约束、日期、截断、输入边界与弃权计分。语料仍需人工复核。

不包含TransactionForm、原生入口、快捷动作、全局按钮、幂等保存或数据库迁移；这些继续受模型验证门槛约束。首装应用断网识别未验证。
