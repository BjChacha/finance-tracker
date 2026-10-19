# 支出优先的数据分布 v1

按用户提供的实际业务占比构建新版本：正常单笔支出85%、收入10%、转账5%。比例只约束输入的真实标签，不作为模型强制预测支出的先验，也没有改提示、候选或模型权重。

| 数据文件 | 支出 | 收入 | 转账 | 需澄清 |
|---|---:|---:|---:|---:|
| [开发集](data/dev.tsv) | 85 | 10 | 5 | 0 |
| [回归集](data/regression.tsv) | 170 | 20 | 10 | 0 |
| [开发保护集](data/dev-guards.tsv) | — | — | — | 20 |
| [回归保护集](data/regression-guards.tsv) | — | — | — | 40 |

正常单笔合计300条，保护样例另计60条；相比原300条总量，正常单笔分母已扩大，不能混用。开发和回归不共享正常单笔场景组或原句。保护集沿用旧样例，其中账户歧义等故障类型有意同时出现于两套保护集，它们不是独立盲测。

## 来源与选择

- 开发支出由旧50条和新增35条构成；新增覆盖买菜、公交、共享单车、考试、住宅修锁、演出票和洗衣服务。
- 回归支出保留上一轮80条，再加入第一轮90条，包括充电、加油、餐饮、购物、医疗等；没有通过复制文本、改金额扩增或模型预测挑样。
- 收入、转账按场景轮询抽样，组内和组间以固定种子哈希排序，尽量保留不同场景。旧集全部保留，未进入新主集的少数类型样例仍可用于完整覆盖回归。
- 每行记录来源文件、原ID和人工审核状态；第一轮90条辅助标签由助手补充，未提账户保持空值，无法确认的日期保留unknown。`policy.json`记录这些标注。金额、类型、分类沿用原标签。
- 原始场景划分继承前几轮；场景组和原句检查不能证明没有语义泄漏。所有语料均为合成样例且等待独立人工核验，旧样例已经被观察过，因此命名为回归集。

## 评分

`score.py`同时输出按样本计算的总分、支出/收入/转账分项、三类型等权宏平均、85/10/5加权分、类型混淆表及完整正确/错误预览。

旧结果按新权重重算只说明业务组合效应，不是新增测试或模型提升。新200条回归直接按条计分，无重复权重；弃权计入未命中。原始字段正确与通过状态/业务检查的可用字段分别计分。未识别账户仍须用户补充，不能为了提高完整预览率自动猜账户。

85%输入属于支出时，始终输出支出的类型基线就是85%；必须结合分类型和宏平均检查是否只是在偏向多数类。保护样例单独报告语义弃权率与错误完整预览数，不混入85/10/5的分母。

## 复现

在项目根目录执行；沿用已准备的本地Q8模型、Python环境和红米设备，不联网推理、不微调。默认构建目录已存在时拒绝覆盖，重建用新目录。

```powershell
python scripts/natural-language/distribution_v1/dataset.py --output artifacts/natural-language-distribution-v1-rebuild
python -m unittest discover -s scripts/natural-language/distribution_v1 -p test_distribution.py
python -m ruff check scripts/natural-language/distribution_v1
& artifacts/natural-language-jev/venv/Scripts/python.exe scripts/natural-language/jev_harness/experiment.py --variants baseline category_only --data scripts/natural-language/distribution_v1/data/regression.tsv --output distribution-v1-reproduction
& artifacts/natural-language-jev/venv/Scripts/python.exe scripts/natural-language/distribution_v1/score.py --run artifacts/natural-language-jev-harness/distribution-v1-reproduction --output artifacts/natural-language-jev-harness/distribution-v1-reproduction-scored
```

新版本不替换旧实验脚本的默认路径，以免旧命令不再可复现。后续开发显式传入本目录的`data/dev.tsv`，并另外执行`data/dev-guards.tsv`。这轮只重跑新主回归集；保护集逐项验证文本与标签不变后复用旧真机预测，再重放相同的确定性修复。评分器拒绝缺行、重复ID、不同语料版本的结果。

保守方案沿用上一轮的分类表述，以及冲突账户清空和基本日期归一化；清空字段不计为语义理解提升。性能预算沿用原报告，这轮质量重跑不能作为新的冷热启动或PSS验收。
