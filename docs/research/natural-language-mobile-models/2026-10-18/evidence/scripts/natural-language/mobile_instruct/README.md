# 更强本地模型与结构约束对照

研究工具，未接入应用、数据库或保存 mutation。模型为已发布的 Qwen3.5-4B Q4_K_M，纯本地 CPU 推理，无项目微调。所有语料仍待独立人工复核；观察过的回归和后续结构消融不能称独立盲测。

当前设备为用户指定的 Xiaomi Pad 8 Pro，serial 为 HA29H4B6。旧红米数据单独保留；设备切换后的指标不能与旧硬件混称。

## 文件与约束

- fetch_model.py：固定上游/量化仓库提交，验证文件 SHA256 与 Git blob；下载许可证和官方聊天模板。
- prompt.txt、runtime.py：冻结的完整语义提示、候选结构和本地聊天请求。JSON Schema 采用当前运行时要求的嵌套包装，关闭思考。
- device_runtime.py、device_compare.py：显式设备的 JevEmbed 保守方案与 Qwen 对照；Qwen 批次 128/64、4 个上下文检查点，CPU4、4096 上下文。
- branch_constraints.py：复用原冻结 grammar_for，以类型分支约束分类和非转账的 to_account。
- safe_constraints.py、safe_evaluate.py：最终研究候选，额外转义模型输入中的聊天控制分隔符。原始金额证据与备注仍使用原文。
- device_benchmark.py：双方相同的 5 次进程冷启动、20 次变化输入热解析；记录 PSS 与 Perfetto。它测的是原 JSON Schema 方案，分支方案的回归延迟须另列，不能偷换为已测的冷启动 p95。
- diagnostic_probes.py：为原保护样例补明确账户，揭露“缺账户碰巧挡住语义错误”的情况；不混入原 200/40 分母。
- device_probes.py：在显式指定的 Android 设备上复核同样 6 条诊断探针，不能用桌面结果代替设备结果。
- report_metrics.py：校验样本身份、汇总同设备指标及跨平台差异。
- archive_evidence.py：归档已完成的结果、源码与 SHA256，排除模型权重、运行时二进制和原始 trace。

freeze.json 固定最初语义方案；device-freeze.json 固定更换设备后的运行配置，均位于 artifacts/natural-language-mobile-instruct。旧运行源码与改进版本分别保留，不覆盖历史结果。源码中最初的 run_frozen.py、benchmark.py 和桌面脚本用于复现旧轮次，当前真机入口应使用显式 serial 的脚本。

## 复现

在项目根目录运行。官方 JevEmbed FP32 审计使用 artifacts/natural-language-jev/venv/Scripts/python.exe；其余脚本使用带 psutil 的 Python 环境。模型、Android arm64 和 Windows llama.cpp b11669 运行时必须先准备好；运行时下载信息见 instruct/sources.json。

```powershell
python scripts/natural-language/mobile_instruct/fetch_model.py
python scripts/natural-language/mobile_instruct/test_contract.py
python scripts/natural-language/mobile_instruct/device_compare.py --serial HA29H4B6 --kind jev --data scripts/natural-language/distribution_v1/data/regression.tsv --output new-jev-regression
python scripts/natural-language/mobile_instruct/safe_evaluate.py --serial HA29H4B6 --data scripts/natural-language/distribution_v1/data/regression.tsv --output new-safe-regression
python scripts/natural-language/mobile_instruct/safe_evaluate.py --serial HA29H4B6 --data scripts/natural-language/distribution_v1/data/regression-guards.tsv --output new-safe-guards
python scripts/natural-language/mobile_instruct/device_benchmark.py --serial HA29H4B6 --kind qwen --data scripts/natural-language/distribution_v1/data/dev.tsv --output new-qwen-performance
python scripts/natural-language/mobile_instruct/device_probes.py --serial HA29H4B6 --output new-device-probes
```

Android 文件目录为 /data/local/tmp/finance-nl-bench：Qwen3.5-4B-Q4_K_M.gguf、jev-qwen3-0.6b-q8_0.gguf、qwen35-official-template.jinja，以及 runtime/ 下的可执行文件和动态库。传输完成并在设备上核验 SHA256 后再启动推理，不并发运行两个设备模型。输出目录已存在时脚本会拒绝覆盖。

冷启动重建进程、模型和缓存，但不清空 Android 文件页缓存。热运行保留模型及前缀/候选向量缓存，输入变化。PSS 是独立原生进程总量，采样间隔为 200ms 加 ADB 开销，不能当作 React Native 增量内存。第一次正式 APK 安装后断网识别、UI 生命周期与交易保存尚未验收。

即使金额、类型、分类达到样例门槛，也要单独核对多笔/否定等保护行为、需要人工补充的字段以及性能。格式合法不等于语义正确；全部研究输出只用于预览与分析。

本轮最终报告位于 docs/research/natural-language-mobile-models/2026-10-18/report.md。新设备完成三组各 200+40 的对照和 6 条诊断探针；最终 harness 的主集金额／类型各 200/200、分类 187/200，但诊断探针仍有 3 条完整错误预览，当前 CPU 性能也不满足预算，因此没有接入产品流程。
