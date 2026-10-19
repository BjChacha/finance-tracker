# 一句话记账模型验证工具

当前数据分布版本见 [distribution_v1](distribution_v1/README.md)：正常单笔按支出85%、收入10%、转账5%，开发100笔、回归200笔，保护样例另列。以下保留第一轮实验的复现说明和原始默认数据，避免历史结果失去对应版本。

这是实施计划第一阶段的独立实验工具，尚未接入 App。当前 UIE-micro + BGE-small-zh-v1.5 候选未通过识别门槛；完整结论见 [本轮报告](../../docs/research/natural-language/2026-10-18/report.md)。

模型下载仅发生在开发机准备阶段。推理脚本只读取本地文件，不提供在线推理回退。模型和中间结果位于已被 Git 忽略的 `artifacts/natural-language/`；应用依赖、数据库、原生入口和表单均未修改。

## 复现

从仓库根目录执行。参考环境为 Windows、Python 3.14.2、CPU Torch，具体版本见 `requirements.txt` 和报告中的 `export-manifest.json`。安装依赖和下载模型需要联网；之后可断网执行其余步骤。

```powershell
uv venv artifacts/natural-language/venv --python 3.14
uv pip install --python artifacts/natural-language/venv/Scripts/python.exe -r scripts/natural-language/requirements.txt --torch-backend cpu
$nlPython = 'artifacts/natural-language/venv/Scripts/python.exe'
& $nlPython scripts/natural-language/download.py
$env:HF_HUB_OFFLINE = '1'
$env:TRANSFORMERS_OFFLINE = '1'
& $nlPython scripts/natural-language/corpus.py
& $nlPython scripts/natural-language/export.py
& $nlPython scripts/natural-language/parity.py
& $nlPython scripts/natural-language/evaluate.py fit
& $nlPython scripts/natural-language/evaluate.py evaluate --split test
& $nlPython scripts/natural-language/diagnose.py
& $nlPython -m unittest discover -s scripts/natural-language -p 'test_*.py' -v
```

若系统代理无法访问 Hugging Face，可显式给下载命令加 `--direct`。不会关闭 TLS 校验；SHA256 不匹配立即失败。下载源、BGE revision、UIE v1.1 版本和许可证来源都记录在 `sources.json`。

`fit` 只使用开发集选择金额/类型提示和阈值；冻结语料、提示、分类上下文与模型导出的摘要。`evaluate` 检查摘要一致，再输出两个精度和规则基线的结果。不要在看过测试失败后继续调整参数并把同一测试集当成新的独立验收集。下一次改模型/语料应另存评测版本，并准备新的未见测试集。

## 文件职责

| 文件 | 职责 |
|---|---|
| `download.py` / `sources.json` | 固定来源、下载及校验，不属于推理路径 |
| `models.py` / `export.py` | 官方 Paddle 权重显式转换，严格检查参数名与形状；导出 ONNX FP32 / INT8 |
| `parity.py` | 原始权重独立 NumPy 前向、Torch、ONNX 对照；含情感分类正向控制、金额及 Unicode 样例 |
| `runtime.py` | ONNX 候选解析、基于原文位置的 span 解码、有效账户匹配、动态分类排序；不写数据库 |
| `money.py` | 整数分转换，拒绝负数、超精度、非法格式及部分有歧义的中文缩写 |
| `evaluate.py` / `metrics.py` | 开发集调参、独立测试、弃权计错、门槛判断与桌面耗时 |
| `diagnose.py` | 给定正确交易类型时的 BGE 分类诊断，不能当作端到端成绩 |
| `data/dev.tsv` / `data/test.tsv` | 100 / 200 条合成候选样例、场景组、预期字段和需澄清标签 |

## 评测口径与边界

- 300 条由助手编写并检查结构，**尚未完成独立人工核验**。`context.json` 显式保留此状态，发布门槛不会通过。
- 开发集 80 条明确单笔、20 条需澄清；测试集 160 条明确单笔、40 条需澄清。分母不能去掉模型弃权的单笔样例。
- 场景分组不跨集合、无重复原句；语义重复仍需人工复核，程序检查不能证明不存在语义泄漏。
- 金额由模型选 span 后交给整数转换器。规则基线只用于比较，不会填补模型未识别字段。
- 类型用 UIE 提示分类，类别用 BGE 对当前候选的名称/父分类/说明排序。本轮数据只验证一级分类；相似度不是置信率，当前没有可靠的类别弃权阈值。
- 账户角色提取仅为实验接口，尚无完整角色标注集。未匹配、无效和同名账户保留待补；账户方向准确率不作已验证声明。
- 未实现日期归一化、子分类回退、表单预填保护、幂等保存、原生交接及全局按钮。只有模型门槛通过后才进入这些阶段。
- 量化采用动态 INT8，包含词嵌入 Gather 与 MatMul。ONNX 算子在桌面 CPU 可运行，不代表 React Native / Android 运行时已验证。
- NumPy 参考按官方 UIE 方程直接使用原始权重，不等同于运行完整 PaddleNLP Taskflow。移动端分词、UTF-16 位置映射仍未验证。
- 桌面单次加载时间不等于冷启动 p95；桌面耗时不替代手机指标。无目标设备时，真机验收字段保持空缺。

## 输出与后续门槛

完整原始预测、原文 span、失败样例位于 `artifacts/natural-language/reports/test/`；数值一致性、分类诊断和开发集试验结果位于同一 artifacts 根目录。本轮可审阅摘要另保存在 `docs/research/natural-language/2026-10-18/`。

推进产品接入前，需要独立人工复核语料、解决金额片段截断及收支类型/分类效果，完成原生运行时和分词的一致性验证，并在红米设备上验证离线首次运行、热/冷 p95 与额外峰值 PSS。不能仅将未测门槛改成通过。
