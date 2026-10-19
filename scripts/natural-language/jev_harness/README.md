# JevEmbed harness 失败归因与消融

本目录是离线研究工具，不接应用保存流程。沿用固定 JevEmbed Qwen3 0.6B Q8 权重及 `../jev`、`../instruct` 的冻结校验器，没有训练模型。账务校验仍拒绝同账户互转、错误枚举和不完整的必要字段。

## 实验边界

- `data/dev.tsv` 为100条开发语料；`dev-annotated.tsv` 补充账户、日期的助手标注。均待独立人工核验。
- `instruct/heldout.tsv` 为已经看过的200条合成回归集，不能再称为独立盲测。每个场景有多个金额变体，不能把200条当成200个独立场景。
- `probes.tsv` 是24条针对角色、否定、退款、方向和日期的检查样例，亦为助手编写，不能替代真实用户测试。
- `oracle_type` 直接提供正确类型，只用于诊断类型判断对分类的级联影响，严禁作为可部署结果。
- 原始字段正确、通过状态/业务拦截后的可用字段、完整正确预览、错误完整预览分别计分。清空非法账户后保留金额不算语义提升。
- 相似度和 softmax 不是正确率；候选 ID 不应参与语义表征。

## 主要文件

- `attribution.py`：按原始错误、状态拦截、业务冲突拆分原200条失败。
- `counterfactual.py`：固定原模型结果，单独复算账户清空与日期默认值的影响。
- `category_sweep.py`：在开发集提供正确类型，比较六种分类表述。
- `revision.py`：隔离的实验变体。`category_only` 仅调整分类表述；`refined` 再加入账户有向候选、日期处理和明确分类指令；`category_joint` 先在全部有效分类中判用途，再从分类确定交易类型。
- `prototypes.json`：收支与交易状态场景候选。属于无训练的提示数据；开发集对照不佳，保留负面结果。
- `experiment.py`：默认在红米运行，`--desktop` 使用本机同一 Q8 权重。最终回归与额外检查运行前保存源文件哈希和快照，输出不覆盖旧目录。较早开发轮次保留当时哈希与输出，第一轮未保存源码快照；最终脚本仍保留这些消融分支。
- `summarize_experiments.py`：生成统一比较表和完整错误明细，可给开发结果补上辅助字段评分。
- `test_revision.py`：日期、动态分类、非法互转和缺失账户的边界检查。

## 复现

在项目根目录执行。首次模型、运行时和 Python 环境准备见 `../jev/README.md`；这里复用已有资源，不请求在线推理。

```powershell
& artifacts/natural-language-jev/venv/Scripts/python.exe scripts/natural-language/jev_harness/attribution.py artifacts/natural-language-jev/reports/comparison-android-q8/predictions.jsonl
& artifacts/natural-language-jev/venv/Scripts/python.exe scripts/natural-language/jev_harness/experiment.py --variants baseline category_only refined category_joint --data scripts/natural-language/instruct/heldout.tsv --output regression-reproduction
& artifacts/natural-language-jev/venv/Scripts/python.exe scripts/natural-language/jev_harness/experiment.py --variants baseline refined category_joint --data scripts/natural-language/jev_harness/probes.tsv --output probes-reproduction
& artifacts/natural-language-jev/venv/Scripts/python.exe -m unittest discover -s scripts/natural-language/jev_harness -p test_revision.py
python -m ruff check scripts/natural-language/jev_harness
```

冷启动、热启动和峰值 PSS 的正式预算检查沿用上轮报告；本轮质量评测中的逐句耗时包含文档缓存填充和 USB 往返，不能冒充新的正式性能验收。Q8 权重大小仍为639,150,752字节。
