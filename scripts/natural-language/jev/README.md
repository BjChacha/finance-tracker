# JevEmbed 纯本地比较工具

这是模型验证原型，不是应用内已上线的解析器。使用官方已合并的中文可用模型，不执行梯度训练、LoRA 训练或基于本项目样例的量化校准。

模型：`HIT-TMG/JevEmbed-Qwen3-Embedding-0.6B`，固定 revision 为 `e4a71aacd9b47ae6106fe57b7bf1c39992dc7ab1`。它的发布者已完成通用决策训练；“本项目不微调”不代表发布权重从未训练过。

## 边界

- 官方 JevEmbed 负责编译 Choice 问题、提示模板、向量归一化和评分。本文工具把金额候选、交易类型、现有分类、账户和时间映射成多个选择问题。
- 代码复用上一轮冻结的整数金额转换与账务校验，不写数据库，不创建账户或分类。
- Choice 的 softmax 和 entropy 只描述候选间相对分数，不能当作正确率。没有通过调阈值隐藏弃权；弃权按原指标计入未命中。
- 查询向量每次重新计算；候选文档按完整文本缓存，最多 4096 条。缓存属于单个模型实例，不能跨模型混用。新的金额片段、账户或分类文本会重新编码。
- 手机仅运行 CPU 原生 embedding 服务；编排、打分、金额转换和缓存暂在主机。延迟包含 USB loopback 往返及主机处理；手机 PSS 不包含主机 Python 和缓存，不等于 React Native 应用增量。
- 原始权重加载使用本地目录、`local_files_only=True`、`trust_remote_code=False`，同时设置 HF 离线环境变量。GGUF 只读已存在文件，HTTP 地址固定为 `127.0.0.1`。准备阶段下载模型，推理阶段无远程推理请求。

## 准备

以下命令从仓库根目录运行。创建专用环境，避免修改应用依赖；完整实测依赖版本随研究报告保存。

```powershell
uv venv --python 3.12 artifacts/natural-language-jev/venv
uv pip install --python artifacts/natural-language-jev/venv/Scripts/python.exe -r docs/research/natural-language-jev/2026-10-18/requirements-reference.txt
git clone https://github.com/HITsz-TMG/JevEmbed.git artifacts/natural-language-jev/source
git -C artifacts/natural-language-jev/source checkout d331c4b0f5a0f69b92d94b8f5b2f82853ac83277
git clone --branch b11669 --depth 1 https://github.com/ggml-org/llama.cpp.git artifacts/natural-language-jev/llama-source
python scripts/natural-language/jev/fetch_model.py
python scripts/natural-language/instruct/fetch.py --android
artifacts/natural-language-jev/venv/Scripts/python.exe scripts/natural-language/jev/prepare.py
```

`fetch_model.py` 核对固定 revision、Git blob 哈希及 LFS SHA256。`prepare.py` 核对源码 revision 和全部权重文件，再生成 F16、Q4_K_M、Q8_0。GGUF 已包含分词词表；手机不需要另外装完整 Transformers 目录。模型/分词文件大小、许可证及 runtime 额外开销应分开计量。

## 准确率与一致性

`prompts-v1.json`、`prompts-v2.json`、`prompts-v3.json` 保留开发尝试；默认 `prompts.json` 是已冻结的 v2。v3 使用英文任务指令，中文输入及候选不变。不得依据比较集结果重选协议后仍称独立验证。

```powershell
artifacts/natural-language-jev/venv/Scripts/python.exe scripts/natural-language/jev/evaluation.py --reference --data scripts/natural-language/instruct/heldout.tsv --output comparison-reference-new
artifacts/natural-language-jev/venv/Scripts/python.exe scripts/natural-language/jev/evaluation.py --device --model jev-qwen3-0.6b-q4_k_m.gguf --data scripts/natural-language/instruct/heldout.tsv --output comparison-android-q4-new
artifacts/natural-language-jev/venv/Scripts/python.exe scripts/natural-language/jev/evaluation.py --device --model jev-qwen3-0.6b-q8_0.gguf --data scripts/natural-language/instruct/heldout.tsv --output comparison-android-q8-new
artifacts/natural-language-jev/venv/Scripts/python.exe scripts/natural-language/jev/compare_results.py --reference comparison-reference-new --candidates comparison-android-q4-new comparison-android-q8-new
```

不要同时执行两个手机任务，它们使用同一个受保护的端口。输出目录必须是新目录，工具拒绝覆盖旧实验。全量逐条输出在 `predictions.jsonl`，另外生成全量失败 TSV、按场景诊断及量化前后决策一致率。

`parity.py --reference` 仅从开发集每十条取一条，记录实际编译输入的参考分词及向量。之后用 `--model <local-gguf>` 或 `--device --model <remote-filename>` 对照。原报告中的 96 段控制使用 v1；重新用冻结 v2 生成时样本数可能不同，不能覆盖原结果后混报。

## 真机性能

沿用既有 Android b11669 运行库目录 `/data/local/tmp/finance-nl-bench/runtime`。设备 serial 固定为用户授权的 `57721e63`。权重推送后应核对设备 SHA256。仅管理当前任务创建的 server PID 和 ADB forward。

```powershell
& 'C:/Users/bjcha/AppData/Local/Android/Sdk/platform-tools/adb.exe' -s 57721e63 push artifacts/natural-language-jev/models/jev-qwen3-0.6b-q8_0.gguf /data/local/tmp/finance-nl-bench/
& 'C:/Users/bjcha/AppData/Local/Android/Sdk/platform-tools/adb.exe' -s 57721e63 shell sha256sum /data/local/tmp/finance-nl-bench/jev-qwen3-0.6b-q8_0.gguf
artifacts/natural-language-jev/venv/Scripts/python.exe scripts/natural-language/jev/device_benchmark.py --model jev-qwen3-0.6b-q8_0.gguf --output device-q8-new --cold-runs 20 --warm-runs 60 --trace
```

冷测每次重建进程、模型和候选缓存，包含所有候选编码，不清空系统文件缓存。热测只预热第一条开发样例，随后输入变化，遇到新候选仍计入耗时。PSS 从独立原生进程 `smaps_rollup` 周期采样；短暂峰值可能遗漏。保存完整 PSS 样本、温度、20 秒 Perfetto 和 PID，使用上一轮 `instruct/analyze_trace.py` 分析实际调度数据。

原始 trace 位于本地 artifacts，不将它误作应用冷启动、首装断网或完整业务保存验收。CPU 原型结论不能直接代表未来 ONNX、NNAPI 或 GPU 实现。

## 合约检查

```powershell
artifacts/natural-language-jev/venv/Scripts/python.exe -m unittest discover -s scripts/natural-language/jev -p test_decision.py -v
uv tool run ruff check scripts/natural-language/jev
uv tool run ruff format --check scripts/natural-language/jev
```

覆盖候选过滤、同名账户、上下文自定义分类、金额整数化、必要字段缺失、同账户互转、非有限向量、输入长度，以及缓存更新与模型实例隔离。语义正确率必须看模型评测，不能由这些合约测试代替。
