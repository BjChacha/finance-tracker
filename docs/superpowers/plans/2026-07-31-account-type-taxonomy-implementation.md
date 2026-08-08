# 账户类型分类优化实施计划

## 目标

在不改变余额、汇率、交易和资产负债计算逻辑的前提下，将账户类型升级为以下九种，并完整兼容旧数据库与旧备份：

1. `cash`：现金
2. `bank`：银行账户
3. `digital_wallet`：电子钱包
4. `stored_value_card`：充值卡
5. `credit_card`：信用卡
6. `online_credit`：网络信用账户
7. `investment`：投资账户
8. `long_term_asset`：长期资产
9. `other`：其他账户

批准的设计文档：

- `docs/superpowers/specs/2026-07-31-account-type-taxonomy-design.md`

实现参考：

- Expo SDK 57 SQLite documentation: `https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/`

## 关键约束

- 账户类型只负责分类和分组；资产与负债继续依据折算余额的正负判断。
- 旧 `cash`、`bank`、`credit`、`other` 保留或迁移到语义等价类型。
- 旧 `alipay`、`wechat` 及未知类型统一迁移为 `other`。
- 不根据账户名称推断新类型。
- 导入流程自动创建的未知账户继续使用 `other`。
- 当前工作区有大量无关未提交修改；实施时只做窄补丁，不覆盖或格式化无关文件。
- 项目使用 Expo SDK 57；数据库实现继续沿用现有 Drizzle + `expo-sqlite` 同步迁移机制。

## 总体顺序

```text
Canonical taxonomy
  -> local database migration
  -> backup schema upgrade
  -> repository boundary normalization
  -> UI labels and grouping
  -> focused tests
  -> full verification
```

先建立唯一类型定义和纯映射函数，再让数据库迁移、备份升级与 UI 复用相同语义。这样可以避免三套兼容映射独立漂移。

## Task 1：建立账户类型单一事实源

### 文件

- Create: `src/db/account-types.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/features/accounts/index.ts`
- Create: `src/db/__tests__/account-types.test.ts`

### 实施

1. 在 `src/db/account-types.ts` 定义按产品展示顺序排列的只读元组 `ACCOUNT_TYPES`。
2. 由该元组派生 `AccountType`，避免手写 union 与运行时列表不一致。
3. 提供纯函数 `normalizeAccountType(value: unknown): AccountType`：

   - 九种当前值原样返回；
   - 旧 `credit` 返回 `credit_card`；
   - 旧 `alipay`、`wechat`、未知字符串、非字符串和空值返回 `other`。

4. `src/db/schema.ts` 从新模块导入 `AccountType`，并继续重新导出该类型，保持现有导入路径兼容。
5. `src/features/accounts/index.ts` 重新导出 `ACCOUNT_TYPES` 与 `normalizeAccountType`，供界面从账户功能边界使用。

### 测试

在 `src/db/__tests__/account-types.test.ts` 覆盖：

- `ACCOUNT_TYPES` 精确包含九项、顺序正确、无重复；
- 每个当前类型经过 normalize 后保持不变；
- `credit` 映射为 `credit_card`；
- `alipay`、`wechat`、未知值、`null` 和 `undefined` 映射为 `other`。

### 阶段验证

```powershell
npm test -- --runInBand src/db/__tests__/account-types.test.ts
npm run typecheck
```

## Task 2：新增本地数据库数据迁移

### 文件

- Create: `src/db/migrations/0003_account_types.sql`
- Modify: `src/db/migrations/migrations.js`
- Modify: `src/db/migrations/meta/_journal.json`
- Create: `src/db/__tests__/account-type-migration.test.ts`

### 实施

1. 手写 `0003_account_types.sql`。这是数据值迁移，不修改表、列、索引或约束，因此不运行 `db:generate`，也不生成新的 Drizzle schema snapshot。
2. 使用单条 `UPDATE ... CASE` 归一化 `accounts.type`：

   - 保留全部九种当前类型；
   - `credit` 改为 `credit_card`；
   - 其他所有值，包括 `alipay`、`wechat`，改为 `other`。

3. 在 `migrations.js` 注册 `m0003`。
4. 在 `_journal.json` 追加 `idx: 3` 的条目；时间戳使用实施时的单调递增值，tag 固定为 `0003_account_types`。
5. 不修改 `src/db/migrate.ts`，继续使用现有同步迁移执行路径。

### 自动测试

`account-type-migration.test.ts` 不伪造 Native SQLite 执行环境，而验证两层完整性：

- migration journal 的最后一项是 `0003_account_types`；
- 通过现有 JavaScript registry 加载迁移，确认存在非空 `m0003` SQL；
- SQL 明确包含 `credit -> credit_card`、已知新类型保留和默认 `other` 分支。

映射语义本身由 Task 1 的纯函数测试负责。Native SQLite 的实际执行由最终 Android 升级冒烟验证负责。

### 阶段验证

```powershell
npm test -- --runInBand src/db/__tests__/account-type-migration.test.ts
npm run typecheck
```

## Task 3：升级备份格式并兼容旧备份

### 文件

- Modify: `src/db/backup-version.ts`
- Modify: `src/features/backup/schema.ts`
- Modify: `src/features/backup/upgraders.ts`
- Modify: `src/features/backup/repository.ts`
- Modify: `src/features/backup/__tests__/schema.test.ts`
- Modify: `src/features/backup/__tests__/upgraders.test.ts`

### 实施

1. 将 `BACKUP_SCHEMA_VERSION` 从 `3` 提升到 `4`。
2. 当前备份的账户类型 schema 改为复用 `ACCOUNT_TYPES`，只接受九种新值。
3. 新增 `backupUpgraders[3]`：

   - 将 `schemaVersion` 更新为 `4`；
   - 遍历 `data.accounts`；
   - 使用 `normalizeAccountType` 归一化每个账户的 `type`；
   - 保留账户和其他表的全部既有字段。

4. 保持恢复顺序不变：信封校验 → `v1/v2/v3` 逐级升级到 v4 → 当前 schema 严格校验 → 写入数据库。
5. `buildBackupFile()` 导出账户时也应用 `normalizeAccountType`，防止被外部工具写入的意外值污染新备份。

### 测试

更新 schema fixture 到版本 4，并新增：

- 九种新类型均通过当前 schema；
- 旧 `credit`、`alipay` 和未知类型不能绕过当前 v4 schema；
- `v3 -> v4` 对 `cash`、`bank`、`credit`、`other` 的映射正确；
- `alipay`、`wechat` 和未知类型升级为 `other`；
- upgrader 保留账户其他字段和其他表；
- `v1 -> v4` 完整链路依次应用多币种、项目和账户类型升级；
- `v4 -> v4` 不调用 upgrader。

### 阶段验证

```powershell
npm test -- --runInBand src/features/backup/__tests__/schema.test.ts src/features/backup/__tests__/upgraders.test.ts
npm run typecheck
```

## Task 4：在查询边界防御性归一化

### 文件

- Modify: `src/features/accounts/repository.ts`

### 实施

1. `listAccountsWithBalance()` 在返回查询结果前，将每行 `type` 经过 `normalizeAccountType`。
2. 保持余额 SQL、排序、归档筛选和 `totalAssets()` 完全不变。
3. 该边界保证账户编辑页、账户列表和资产页不会收到未知类型，从而避免：

   - 类型文案为 `undefined`；
   - 资产页分组遗漏账户；
   - 编辑旧账户时类型选择器没有选中项。

### 测试策略

不为这一行映射新增复制 Drizzle 查询链的 repository mock。该防御层由 `normalizeAccountType` 单测、数据库迁移完整性测试和最终 UI 人工检查共同覆盖；repository 只调用已经单测覆盖的纯函数。

## Task 5：更新中文文案、编辑器与资产分组

### 文件

- Modify: `src/i18n/zh.ts`
- Modify: `app/accounts/edit.tsx`
- Modify: `app/(tabs)/assets.tsx`

### 实施

1. 将 `zh.accounts.types` 更新为九个新类型：

   - 现金
   - 银行账户
   - 电子钱包
   - 充值卡
   - 信用卡
   - 网络信用账户
   - 投资账户
   - 长期资产
   - 其他账户

2. 账户编辑页删除局部 `ACCOUNT_TYPES`，使用账户功能模块导出的固定顺序。
3. 编辑已有账户时，以 `normalizeAccountType(existing.type)` 初始化状态；新建账户仍默认 `cash`。
4. 账户列表通过 Task 4 的 repository 边界收到归一化类型，无需修改渲染逻辑。
5. 资产页删除局部 `TYPE_ORDER`，使用共享顺序；构建分组时对类型再次做轻量防御性归一化。
6. 保持以下逻辑不变：

   - `includeInTotal`；
   - 按余额正负拆分资产/负债；
   - 汇率折算；
   - 账户内部排序；
   - 空类型分组不显示。

7. 不增加新的 UI 组件。现有 chip 容器已经 `flexWrap: 'wrap'`，可容纳九项；重点人工检查“网络信用账户”在窄屏上的换行与点击区域。

### 导入确认

`src/features/import/core/pipeline.ts` 当前自动新建账户已使用 `type: 'other'`，保持代码不变。实施后用搜索与现有导入流程确认该兜底没有被改成名称推断。

### 阶段验证

```powershell
npm run typecheck
rg -n "'alipay'|'wechat'|'credit'" app src
```

搜索结果只应剩余兼容迁移、备份升级及其测试，不应存在旧 UI 类型列表。

## Task 6：完整回归与原生升级冒烟

### 自动验证

```powershell
npm test -- --runInBand src/db/__tests__/account-types.test.ts src/db/__tests__/account-type-migration.test.ts src/features/backup/__tests__/schema.test.ts src/features/backup/__tests__/upgraders.test.ts
npm run typecheck
npm test -- --runInBand
git diff --check
```

### Android 升级冒烟

使用包含旧类型账户的测试数据库，在不清除应用数据的情况下安装新版本：

1. 升级前记录各账户类型、余额、交易数量和净资产。
2. 启动新版本并确认 migration `0003_account_types` 成功执行。
3. 验证：

   - `cash` 仍为“现金”；
   - `bank` 显示为“银行账户”；
   - `credit` 显示为“信用卡”；
   - `alipay`、`wechat` 显示为“其他账户”；
   - 历史 `other` 仍为“其他账户”；
   - 余额、交易数量与净资产没有变化。

4. 新建九种账户，确认编辑页均可选择且资产页按固定顺序分组。
5. 分别给信用卡和网络信用账户设置正、负余额，确认仍按余额方向进入资产或负债。
6. 导入一个无法匹配的外部账户，确认新账户类型为“其他账户”。

### 备份冒烟

1. 恢复一份 schema v3 备份，确认旧类型按兼容表升级且交易完整。
2. 导出 schema v4 备份，确认账户类型只出现九种新值。
3. 再恢复该 v4 备份，确认账户数量、交易数量和余额一致。

## 风险与回滚

### 已知风险

- 数据库迁移会永久丢弃 `alipay` 与 `wechat` 的旧分类信息，将其统一变为 `other`。这是已确认的产品策略。
- 新类型值无法被旧版本 UI 正确识别，因此该迁移是前向迁移，不支持无损降级到旧应用版本。
- “网络信用账户”文本较长，窄屏下需要人工检查 chip 布局。

### 控制措施

- 发布前在测试设备导出一份 v3 备份。
- 数据迁移只更新 `accounts.type`，不触碰余额、交易和关联 ID。
- 先运行 focused tests，再运行全量测试和原生升级冒烟。
- 若升级冒烟发现异常，停止发布并恢复测试设备备份；不要尝试用旧版本直接读取已写入新类型的数据库。

## 完成标准

- 九种类型在模型、备份 schema、账户编辑页和资产分组中保持一致。
- 旧数据库与 v1–v3 备份都能升级到当前版本。
- 旧 `alipay`、`wechat` 和未知类型稳定落入 `other`。
- 导入未知账户仍落入 `other`。
- 资产、负债和净资产结果不因类型调整而变化。
- focused tests、全量 Jest、TypeScript 检查和 `git diff --check` 均通过。
- Android 原生升级与备份恢复冒烟通过。
