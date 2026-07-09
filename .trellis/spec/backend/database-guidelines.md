# Database Guidelines

> 本项目（Expo 记账APP）的数据层约定。ORM: drizzle-orm + expo-sqlite；迁移: drizzle-kit generate，SQL 文件随 bundle 分发，启动时 `useMigrations` 门组件执行。

---

## 核心不变量（改代码前必读）

1. **金额一律整数分（int cents）**。解析用户/导入输入必须走 `src/lib/money.ts` 的 `parseMoneyToCents()`（字符串解析，绝不 `parseFloat * 100`）；展示走 `formatCents()`。
2. **交易日期双字段**：`date`（Unix ms，排序）+ `dateKey`（'YYYY-MM-DD'，写入时经 `toDateKey()` 按本地时区固化）。所有按日/月分组统计只用 `dateKey`，禁止查询时做时区换算。
3. **转账单行建模**：`type='transfer'`，`accountId` 转出、`toAccountId` 转入、`fee` 手续费。收支统计口径：**transfer 的 amount 不计收支，fee 计入支出**。该 CASE 表达式在 transactions/stats/budgets 三个 repository 出现，改口径必须三处同步。
4. **余额不落库**：账户余额 = `initialBalance + Σincome − Σexpense − Σ(转出+fee) + Σ转入`，实时聚合。
5. **软删除**：accounts/categories 用 `archived=1`（交易有外键引用）；transactions 物理删除。
6. **schema 演进强制清单**：修改 `src/db/schema.ts` 影响备份形状时，必须同时 ① `drizzle-kit generate` 生成迁移 ② `BACKUP_SCHEMA_VERSION` +1 ③ 在 `src/features/backup/upgraders.ts` 补 `旧→新` 升级函数 ④ 更新 `src/features/backup/schema.ts` zod 校验 ⑤ 补 fixture 测试。漏任何一步旧备份将无法恢复。

---

## Query Patterns

- 统计聚合下推 SQL（`sql` 模板 + GROUP BY dateKey/categoryId），JS 只做图表数据变形（变形逻辑放 `transform.ts` 纯函数并写单测）。
- 批量插入分批 ≤200 行（SQLite 绑定变量上限 999）。
- 多步写操作用 `db.transaction()` 包裹（恢复备份、导入 commit、周期补账）。
- 导入去重靠 `transactions.fingerprint`（sourceId 优先，否则 日期|金额|方向|备注 的 SHA-256）；周期防重靠 `recurringRuleId + dateKey` 查重。

---
