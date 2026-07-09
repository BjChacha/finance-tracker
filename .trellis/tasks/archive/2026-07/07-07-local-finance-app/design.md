# 技术设计：本地记账 APP

## 技术选型

| 领域 | 选择 | 理由 |
|---|---|---|
| 框架 | Expo SDK 54+（`npx expo install` 管版本），expo-router，strict TS | 全程 Expo Go 真机调试，Windows 无需 Android Studio |
| 存储 | expo-sqlite + drizzle-orm + drizzle-kit | 官方驱动、类型安全、SQL 迁移随 bundle 分发（`useMigrations`） |
| 图表 | react-native-gifted-charts（+ react-native-svg 自绘热力图） | 图表种类丰富、纯 JS+SVG 兼容 Expo Go；全部图表包一层自有组件以便换库 |
| 状态 | @tanstack/react-query（数据库读缓存/失效）+ zustand（UI 态） | SQLite 视作"本地服务端"，写操作集中失效相关 query |
| 文件 | expo-file-system + expo-sharing + expo-document-picker，收敛到 `lib/fs.ts` | 官方组合；隔离 SDK 54 新旧 API 差异 |
| 其他 | papaparse（CSV）、zod（校验）、dayjs、expo-crypto（UUID/指纹）、expo-notifications（本地提醒）、@shopify/flash-list、iconv-lite 懒加载（GBK） | |

## 数据模型（SQLite）

表：`accounts`、`categories`（两级）、`transactions`、`budgets`、`recurring_rules`、`import_batches`、`import_mappings`、`settings`（KV）。

关键决策：
- **金额整数分**：`amount INTEGER` 恒正，方向由 `type` 决定
- **转账单行建模**：`type='transfer'`，`account_id` 转出 + `to_account_id` 转入 + `fee`（手续费计入支出统计）；天然原子
- **日期双字段**：`date`（Unix ms）+ `date_key 'YYYY-MM-DD'`（写入时本地时区固化，图表分组稳定）
- **余额不落库**：实时聚合 `initial_balance + Σ收入 − Σ支出 − Σ转出 − Σ手续费 + Σ转入`
- **软删除**：accounts/categories 用 `archived`；交易物理删除
- 交易附加列：`fingerprint`（SHA-256 去重）、`import_batch_id`（整批撤销）、`recurring_rule_id`（防重复生成）

索引：`transactions(date_key)`、`(account_id, date_key)`、`(to_account_id, date_key)`、`(category_id, date_key)`、`(fingerprint)`、`(import_batch_id)`；`recurring_rules(enabled, next_run_date)`。

## 迁移框架契约（src/features/import/core/）

```typescript
interface NormalizedTransaction {
  direction: 'expense' | 'income' | 'transfer';
  amountCents: number;          // 恒正
  date: string;                 // 'YYYY-MM-DD' 或含时间
  note?: string;
  rawCategory?: string; rawSubCategory?: string;
  rawAccount?: string; rawToAccount?: string;
  sourceId?: string;            // 源流水号，优先参与去重
  raw?: Record<string, string>;
}

interface ImportAdapter {
  id: string; displayName: string; fileExtensions: string[];
  configSchema?: ZodTypeAny;    // 通用CSV的列映射配置
  detect(ctx: ImportFileContext): Promise<{ confidence: number; reason?: string }>;
  parse(ctx: ImportFileContext, config?: unknown): Promise<ParseResult>;
}
```

- `ImportFileContext`：框架负责读文件与编码（`readText(encoding)`/`readHead(lines)`），UTF-8/GBK
- `AdapterRegistry`：register/getAll/get/detect（并发探测按 confidence 降序）
- 流水线：选文件 → 探测 → 配置/列映射 → 解析 → 映射计划（import_mappings 记忆 + 相似度）→ 指纹去重 → 预览 → 单事务 commit → undoBatch
- `GenericCsvAdapter`：detect 恒 0.2 兜底；configSchema 驱动列映射向导 UI

## 备份格式

```jsonc
{ "format": "finance-tracker-backup", "schemaVersion": N, "appVersion": "x.y.z",
  "exportedAt": "...", "data": { accounts, categories, transactions, budgets,
  recurring_rules, import_batches, import_mappings, settings } }
```

恢复：zod 校验 → 版本比对 → `backupUpgraders` 逐级升级 → 事务内清空重建（UI 双确认 + 恢复前自动安全备份）。高版本拒绝。

## 架构分层与目录

```
UI (app/ 路由薄壳 + features/*/components) → hooks (react-query) → repository.ts → db/client.ts
```

```
app/(tabs)/{index,stats,budgets,profile}.tsx  add-transaction.tsx(modal)  import/  accounts/ categories/ recurring/ transaction/[id]
src/db/{schema.ts,client.ts,migrations/,seed.ts}
src/features/{transactions,accounts,categories,budgets,recurring,stats,backup,import}/
src/components/ui/  src/lib/{money,date,csv,id,fs,notify}.ts  src/theme/  src/i18n/zh.ts
```

边界：feature 间只经 `index.ts` 出口互引；`db/` 只被 repository 引用；UI 不直接写 SQL。

## 周期记账执行

启动/回前台时 `recurringService.catchUp()`：扫描 `enabled=1 AND next_run_date <= today`，循环补建交易并推进 `next_run_date`（月末对齐：anchor=31 且当月不足则取月末）。不依赖后台任务；通知仅提醒。

## 风险与规避

- GBK 账单：encoding.ts 探测 + iconv-lite 懒加载 + 预览页手动切换
- 金额脏数据：`parseMoneyToCents()` 字符串解析不经 float
- schema 演进：改 schema 必须同步补备份 upgrader + fixture 测试
- 图表库更换风险：所有图表经自有包装组件隔离
