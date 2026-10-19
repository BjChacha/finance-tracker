# 消费总报 + AI 分析 设计

- 日期：2026-10-18
- 状态：已实现
- 范围：月 / 自然季 / 自然年三个周期的消费总报，脱敏后交 LLM 分析消费风格与省钱建议

## 1. 目标

1. 按周期生成消费总报（本地统计），**展示与出网的数据都必须是脱敏的**。
2. 基于总报调用 LLM，输出消费风格、洞察与省钱建议，结果持久化可离线回看。
3. 报告必须包含收入总额与结余率，供模型判断收支平衡风险。

## 2. 架构

```text
app/reports/index.tsx                 路由页（SecondarySheetScreen）
app/_layout.tsx                       注册 reports/index 路由
src/features/dashboard/stats-screen.tsx  统计页入口卡片

src/features/reports/
  snapshot.ts         从 DB 聚合 → ReportSnapshot（zod 契约，本地展示源）
  llm-payload.ts      ReportSnapshot → ReportAnalysisInput（显式白名单，唯一出网形状）
  analysis-contract.ts  LLM 输出 zod 契约 + 解码（失败抛 ParseError）
  request.ts          chat-completions 请求（JSON mode、thinking disabled）
  analyzer.ts         可注入 transport 的分析管线（单测用）
  remote-analyzer.ts  DeepSeek 接线、60s 超时、token 用量捕获与计费
  repository.ts       reports 表读写（upsert / 契约校验 / 损坏行降级）
  generate.ts         快照 → 分析 → 落库 的编排 + EmptyPeriodError
  hooks.ts            react-query：snapshot / stored / generate mutation
  components/report-screen.tsx   报告界面
  labels.ts           文案 + system prompt

src/features/llm/chat.ts            共享 chat 契约（请求类型、ParseError、完成校验）
src/features/transactions/natural-language/{deepseek,parser}.ts  改为复用共享契约
```

## 3. 脱敏边界（Privacy by Construction）

两条独立防线：

1. **快照只产出聚合字段**：`buildReportSnapshot` 的 SQL 从不选择 `note`、账户名、项目名，也不保留交易日期。
   - 分类：一级分类名 + 金额 + 占比（Top 8，其余合并为「其余 N 个分类」）
   - 时间：周期内第 N 周 / 年度按自然月；工作日 vs 周末占比
   - 明细：Top 8 大额仅含 `{分类, 金额, 第几周}`
   - 收入、支出、结余、结余率、笔数、有支出天数、日均、最大单笔、环比
2. **出网 payload 用白名单显式投影**：`toAnalysisInput` 逐字段构造，禁止展开快照对象。新增快照字段不会自动进入请求。

不脱敏的项：分类名（分析必需）、聚合金额、周期标签（如「2026年10月」）。`periodKey`、精确日期、备注、账户、项目名永不出网。

### 可执行验证

- `snapshot.test.ts`：seed 事务写入 `SECRET-REMARK-42` 备注与 `Secret Account` 账户名，断言序列化快照两者都不出现、且不含 `YYYY-MM-DD`。
- `llm-payload.test.ts`：断言 payload 顶层键集合固定；不含 `note/account/project/id/dateKey/date` 键；不含 `2026-10`（periodKey 不出网）。

## 4. 数据模型

```sql
CREATE TABLE reports (
  id text PRIMARY KEY NOT NULL,
  period text NOT NULL,        -- month | quarter | year
  period_key text NOT NULL,    -- 2026-10 | 2026-Q4 | 2026
  snapshot text NOT NULL,      -- JSON ReportSnapshot
  analysis text NOT NULL,      -- JSON ReportAnalysis
  model text NOT NULL,
  cost_micros integer NOT NULL,
  generated_at integer NOT NULL
);
CREATE UNIQUE INDEX uq_reports_period_key ON reports (period, period_key);
```

- 同一周期重新生成 → `onConflictDoUpdate` 覆盖，不累积重复行。
- 读取时用 zod 重新校验两个 JSON 列；契约不匹配则告警并返回 `null`（可重新生成），不让坏数据阻塞页面。
- 迁移：`0008_familiar_luminals.sql`。

## 5. LLM 管线

- 复用 `deepseek-flash` 与构建期内联 key；报告场景单独配置 `timeoutMs = 60s`。
- 请求：`response_format = json_object`、`thinking = disabled`、`temperature = 0.3`、`max_tokens = 2048`；system prompt 明确「只输出 JSON」与条数/字数上限。
- 输出契约（zod）：

```ts
{
  spendingStyle: string(1..200),
  styleTags: string[](1..6, 每条 ≤24),
  insights: { title, detail }[](1..5),
  suggestions: { title, detail }[](1..5),
}
```

- 未知键被 zod 剥离；缺字段、超条数、非法 JSON、`finish_reason = length` 一律拒绝。
- 计费：transport 的 usage sink 在本次调用内捕获 usage，同时写 `llm_usage`；报告行快照 `costMicros`，界面展示「生成于 / 模型 / 花费」。
- 失败分类复用 `ParseError.failure`（missing_key / unauthorized / rate_limited / timeout / server / network / invalid_response）。

## 6. 交互

- 入口：统计页顶部「消费报告」卡片 → `/reports`。
- 周期切换复用 `usePeriod` + `PeriodControl`（月/季/年、左右翻页、禁止未来）。
- 摘要区始终本地即时渲染（不需要 LLM、不产生费用）。
- AI 区：无报告时显示脱敏说明 + 「生成 AI 分析」；有报告时展示风格标签、一句话风格、洞察、建议、生成元信息与「重新生成」（提示会再次计费）。
- 空周期隐藏生成按钮。
- 生成中显示进度；错误按 failure 映射为中文提示。
- 交易数据变更通过 `invalidateTransactionData` 失效 `['reports']`，摘要不会陈旧。
- mutation 以 `PeriodSelection` 为变量：切换周期时不会把旧周期的 pending/error 显示到新周期。

## 7. 测试

| 文件 | 覆盖 |
| --- | --- |
| `snapshot.test.ts` | 费用口径（转账手续费计支出）、同进度区间环比、父子分类归并、周/月序列、金额分档、Top 明细、脱敏、空周期、年度部分周期 |
| `llm-payload.test.ts` | 白名单投影、敏感键/日期/periodKey 不外泄、分转元精度 |
| `analysis-contract.test.ts` | 合法解码、未知键剥离、缺字段/超限/非法 JSON 拒绝、长度上限 |
| `analyzer.test.ts` | 请求形态（JSON mode、prompt、payload 原样）、transport 失败透传、截断拒绝 |
| `account-type-migration.test.ts` | 0008 为最新迁移、reports 表与唯一索引 |

验证命令：

```bash
npx tsc --noEmit
npx jest
```

## 8. 已知限制 / 后续

1. key 内联在 bundle 中可被反编译；分发前应改为服务端代理（与一句话记账同一问题）。
2. 生成调用无取消入口：页面离开后请求继续，结果照常落库（幂等覆盖）。
3. 汇率按交易发生时的 `exchange_rate` 快照折算本位币，与统计模块口径一致。
4. 结转/退款不做特殊建模，沿用 `expense` / `income` 类型口径。
