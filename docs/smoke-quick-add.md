# 记一笔（Quick Add）冒烟用例

> 覆盖「桌面长按图标 → 记一笔快捷动作」的冷启动 / 热启动主路径与取消路径。
> 本文档基于当前代码事实编写，所有操作步骤、预期与代码引用均可溯源。

---

## 1. 功能与机制概述

### 1.1 入口链路（Android）

1. 长按桌面图标 → 系统弹出动态快捷动作列表，其中一项为「记一笔」
   - 注册位置：`modules/quick-keypad/.../QuickKeypadModule.kt` → `registerQuickAddShortcut()`
   - shortcut id = `add-transaction`，shortLabel/longLabel = 「记一笔」
2. 选中后启动 `QuickKeypadActivity`（独立 task，translucent，**navigate 模式**，非 result 模式）
3. 用户在小键盘输入金额 → 点击 **OK**
   - `QuickKeypadActivity.confirm()`：
     - 求值 `Calc.eval(expr)` → `cents`；为 0 且未开 `allowZero` 则直接拦截、不继续
     - **正数 → type = `expense`；负数 → type = `income`**，金额取绝对值
     - `QuickAddHandoffController.publishLaunch(launch)`：写入 `pendingLaunch`（TTL 30s），若 JS listener 已注册则**立即**触发事件
     - 构造 deep link：`finance-tracker://quick-add-transaction?amount=<cents>&currency=<C>&type=<T>&handoffId=<uuid>`
     - `startActivity(MainActivity)` 携带 `EXTRA_HANDOFF_ID`，并 `beginMainActivityHandoff()` 开启 handoff 遮罩计时
4. 进入「记一笔」界面（`quick-add-transaction`）：因 `initialAmountCents` 非空，`AddTransactionFlow` **直接进入 form stage**（`TransactionForm`，`renderMode="editor"`），金额 / 币种 / 类型已预填，无需再输入金额

### 1.2 冷启动 vs 热启动（技术分界）

| 维度 | 冷启动 | 热启动 |
| --- | --- | --- |
| 进程状态 | ReactHost 未加载 / 被回收 | 进程存活、MainActivity 在后台（singleTask） |
| launch 送达方式 | JS 加载后 `getPendingQuickAddLaunch()` **主动拉取** | `onQuickAddLaunch` 事件 **被动接收** + MainActivity `onNewIntent` |
| 关键代码 | `useQuickActionsBootstrap` 初始 `useState(getPendingQuickAddLaunch)` | `addQuickAddLaunchListener` 订阅 |
| 风险点 | bundle 加载慢时依赖 pendingLaunch 的 30s TTL；ReactHost 预热 | listener 已注册则事件不丢；deep link 命中已存在的 MainActivity |

两者共用的防闪屏机制：`QuickAddHandoffController.begin()` 在 MainActivity decorView 上盖一层遮罩，路由渲染后由 JS 侧 `completeQuickAddHandoff(handoffId)`（`quick-add-transaction.tsx` 的 `onLayout`）移除；**5s 超时兜底自动移除**。

### 1.3 热启动下的两种返回路径（2.x vs 3.x 的分界）

热启动时 MainActivity 已存在（singleTask），deep link 经 `onNewIntent` 送达。区别在于触发快捷动作前，app 停留在**哪一层路由**：

| 路径 | 触发前的界面 | 路由栈状态 | 额外处理 |
| --- | --- | --- | --- |
| 2.x 一级界面 | `(tabs)` 的 4 个 tab：概览 / 资产 / 报表 / 设置 | 栈底即 tabs，无上层 modal | 无 |
| 3.x 二级界面 | 从 tab 进入的详情/编辑页：交易列表、账户管理、分类、外观、周期记账、`/transaction/[id]` 等 | 栈上压着二级 screen（多为 `transparentModal`） | `useQuickActions.ts` 在路由前执行 `if (router.canDismiss()) router.dismissAll();` 清除残留，避免遮罩 quick-add |

> 3.x 的核心验证点：二级界面栈残留是否被 `dismissAll()` 正确清除、quick-add 显示在最前且无遮挡。

### 1.4 记一笔界面（quick-add-transaction）

- 路由：`app/quick-add-transaction.tsx`，`presentation="screen"`，标题「记一笔」（`zh.tx.addTitle`）
- **确认 = 底部「保存」按钮**（`saveFooter` → `handleSave` → `create.mutate`）
  - 成功后 `onCreated = handleCreated`：`ToastAndroid.show("记一笔成功")` → `router.replace("/")` → `BackHandler.exitApp()`（回到桌面）
- **取消 = 左上角「✕」或硬件返回键**
  - `handleBack`：`router.replace("/")` → `BackHandler.exitApp()`（回到桌面，不落库）

---

## 2. 通用前置条件与环境

- **设备 / 构建**：Android 真机或模拟器，已安装 debug 构建（`npm run android`），包名 `com.anonymous.financetracker`
- **基础数据**：至少存在 1 个账户、1 个支出分类、1 个收入分类（首次启动 `seedIfEmpty` 已保证；若清过库需重新进 app 让其播种）
- **冷启动构造**：系统「最近任务」里把 app **划掉**，或 `设置→应用→强行停止`；确认 `adb shell ps | grep financetracker` 无进程
- **热启动-一级（2.x）构造**：打开 app 到任一 tab（概览/资产/报表/设置），按 Home 键回桌面；**不要划掉**，确保进程存活
- **热启动-二级（3.x）构造**：打开 app → 进入任一二级界面（推荐「交易列表」：概览页右上搜索图标进入 `/transactions`，或 设置→外观 `/appearance`），按 Home 键回桌面；**不要划掉**
- **金额约定**：小键盘输入正数（如 `12.34`）→ 预期 type = 支出；输入负数（如 `-50`）→ 预期 type = 收入（边界用例见 §4）
- **数据校验**：保存后回到 app「交易列表/概览」确认新增记录；可选 `adb` 执行 sqlite 查询核对 `transactions` 表行数与字段

---

## 3. 冒烟用例

### TC-QA-1.1 ｜ 冷启动 · 保存

| 项 | 内容 |
| --- | --- |
| 场景 | 进程未运行时，通过快捷动作完成一笔记录并保存 |
| 前置 | 冷启动构造（§2）；记录保存前的交易总数 `N` |

**操作步骤**

1. 长按桌面图标 → 快捷动作列表出现「记一笔」
2. 选择「记一笔」→ 原生小键盘自底部滑入
3. 输入任意正数金额（如 `12.34`）
4. 点击 **OK**
5. 进入「记一笔」界面，金额已预填为 `12.34`、类型为「支出」
6. 点击底部 **保存** 按钮

**预期结果**

1. 步骤 4 后 MainActivity 启动；handoff 遮罩在路由渲染后移除，**不应长时间黑屏**（兜底 5s）
2. 步骤 5 表单金额、币种（默认 ¥/CNY）、类型（支出）与小键盘输入一致；分类/账户已自动兜底预选
3. 步骤 6 后底部弹出 Toast「**记一笔成功**」
4. 随后退回**系统桌面**（app 不留在前台）
5. 数据：交易总数变为 `N+1`，新增记录金额 = `12.34`、币种 = CNY、类型 = 支出、日期 = 当天

**关联代码**：`QuickKeypadActivity.confirm` → `publishLaunch` → `useQuickActionsBootstrap`(getPending) → `quick-add-transaction` → `TransactionForm.handleSave` → `useCreateTransaction` → `handleCreated`

---

### TC-QA-1.2 ｜ 冷启动 · 取消

| 项 | 内容 |
| --- | --- |
| 场景 | 进程未运行时，通过快捷动作进入记一笔后放弃 |
| 前置 | 冷启动构造（§2）；记录交易总数 `N` |

**操作步骤**

1. – 5. 同 TC-QA-1.1
2. 点击左上角 **✕**（或按硬件返回键）

**预期结果**

1. – 5. 同 TC-QA-1.1 的步骤 1–5 预期
2. 直接退回**系统桌面**，无 Toast、无保存
3. 数据：交易总数仍为 `N`，**无新增**

**关联代码**：`quick-add-transaction.handleBack` → `router.replace("/")` + `BackHandler.exitApp()`；`BackHandler.hardwareBackPress` 同样路由到 `handleBack`

---

### TC-QA-2.1 ｜ 热启动（一级界面）· 保存

| 项 | 内容 |
| --- | --- |
| 场景 | 进程存活、app 停在一级 tab 界面时，通过快捷动作完成并保存 |
| 前置 | 热启动-一级构造（§2）：先打开 app 到「概览」tab，按 Home 回桌面；交易总数 `N` |

**操作步骤**

1. 长按桌面图标 → 选择「记一笔」→ 小键盘滑入
2. 输入任意正数金额（如 `88`）
3. 点击 **OK**
4. 进入「记一笔」界面，金额已预填为 `88`、类型为「支出」
5. 点击底部 **保存**

**预期结果**

1. 步骤 3 后**快速**进入记一笔界面（热启动无 bundle 加载，事件经 `onQuickAddLaunch` 即时送达）
2. handoff 遮罩正常移除，不应出现旧路由（如「概览」）闪现
3. 表单金额 / 币种 / 类型与小键盘一致
4. Toast「**记一笔成功**」→ 退回系统桌面
5. 数据：新增 1 条，金额 = `88`、类型 = 支出、日期 = 当天

**关联代码**：`publishLaunch` → listener 触发 `sendEvent("onQuickAddLaunch")` → `useQuickActionsBootstrap` 的 `addQuickAddLaunchListener` → `router.replace(toQuickAddTransactionHref)`

---

### TC-QA-2.2 ｜ 热启动（一级界面）· 取消

| 项 | 内容 |
| --- | --- |
| 场景 | 进程存活、app 停在一级 tab 界面时，通过快捷动作进入后放弃 |
| 前置 | 同 TC-QA-2.1；交易总数 `N` |

**操作步骤**

1. – 4. 同 TC-QA-2.1
2. 点击左上角 **✕**（或硬件返回键）

**预期结果**

1. – 4. 同 TC-QA-2.1 的步骤 1–4 预期
2. 直接退回系统桌面，无 Toast、无保存
3. 数据：交易总数仍为 `N`，无新增

**关联代码**：同 TC-QA-1.2 的 `handleBack`

---

### TC-QA-3.1 ｜ 热启动（二级界面）· 保存

| 项 | 内容 |
| --- | --- |
| 场景 | 进程存活、app 停在二级界面（路由栈有上层 modal/screen 残留）时，通过快捷动作完成并保存 |
| 前置 | 热启动-二级构造（§2）：打开 app → 进入「交易列表」(`/transactions`) 或「设置→外观」(`/appearance`) 等二级界面 → Home 回桌面；交易总数 `N` |

**操作步骤**

1. 长按桌面图标 → 选择「记一笔」→ 小键盘滑入
2. 输入任意正数金额（如 `36.9`）
3. 点击 **OK**
4. 进入「记一笔」界面，金额已预填为 `36.9`、类型为「支出」
5. 点击底部 **保存**

**预期结果**

1. 步骤 3 后进入记一笔界面；**原先停留的二级界面（如交易列表）应已被清除**，不残留在栈上、不遮挡 quick-add（由 `router.dismissAll()` 处理）
2. handoff 遮罩正常移除，不闪现二级界面
3. 表单金额 / 币种 / 类型与小键盘一致
4. Toast「**记一笔成功**」→ 退回系统桌面
5. 数据：新增 1 条，金额 = `36.9`、类型 = 支出、日期 = 当天

**关联代码**：`publishLaunch` → `onQuickAddLaunch` → `useQuickActionsBootstrap` 中 `if (router.canDismiss()) router.dismissAll();`（清二级栈残留）→ `router.replace(toQuickAddTransactionHref)`

---

### TC-QA-3.2 ｜ 热启动（二级界面）· 取消

| 项 | 内容 |
| --- | --- |
| 场景 | 进程存活、app 停在二级界面时，通过快捷动作进入后放弃 |
| 前置 | 同 TC-QA-3.1；交易总数 `N` |

**操作步骤**

1. – 4. 同 TC-QA-3.1
2. 点击左上角 **✕**（或硬件返回键）

**预期结果**

1. – 4. 同 TC-QA-3.1 的步骤 1–4 预期（含二级界面被清除、不遮挡）
2. 直接退回系统桌面，无 Toast、无保存
3. 数据：交易总数仍为 `N`，无新增

**关联代码**：同 TC-QA-1.2 的 `handleBack`

---

### 补充：输入阶段分支（冒烟必测）

> 以下三条与主用例同链路，覆盖小键盘输入阶段的关键分支，建议与主 6 条一起纳入每次冒烟。

#### TC-QA-E1 ｜ 小键盘阶段取消

| 项 | 内容 |
| --- | --- |
| 场景 | 小键盘弹出后、点 OK 前放弃 |
| 前置 | 冷启动构造（§2）；交易总数 `N` |

**操作步骤**

1. 长按桌面图标 → 选择「记一笔」→ 小键盘滑入
2. 输入任意金额（或保持为空）
3. 点击遮罩空白区域 / 按硬件返回键

**预期结果**

1. 小键盘关闭，**不拉起 MainActivity**；冷启动时 app 完全不启动（停在桌面）
2. 无 Toast、无「记一笔」界面
3. 数据：交易总数仍为 `N`，无新增

**关联代码**：`QuickKeypadActivity` 遮罩 `setOnClickListener { cancel() }` / 返回键 → `cancel()` → `setResult(RESULT_CANCELED); finish()`；navigate 模式下不 `publishLaunch`、不启动 MainActivity

---

#### TC-QA-E2 ｜ 零金额拦截

| 项 | 内容 |
| --- | --- |
| 场景 | 输入结果为 0 时点 OK 应被拦截 |
| 前置 | 冷启动或热启动构造（§2） |

**操作步骤**

1. 长按桌面图标 → 选择「记一笔」→ 小键盘滑入
2. 不输入任何数字（显示 `0.00`），或输入 `0` / `0.00`
3. 点击 **OK**

**预期结果**

1. OK **无反应**（不进入记一笔界面、不关闭小键盘）；小键盘保持可用
2. 不落库、不启动 MainActivity

**关联代码**：`QuickKeypadActivity.confirm()` 中 `if (cents == 0L && !allowZero) { cancelPerformance(...); return }`

---

#### TC-QA-E3 ｜ 负金额自动转收入

| 项 | 内容 |
| --- | --- |
| 场景 | 输入负数时，类型应自动判定为「收入」、金额取绝对值 |
| 前置 | 冷启动或热启动构造（§2）；交易总数 `N` |

**操作步骤**

1. 长按桌面图标 → 选择「记一笔」→ 小键盘滑入
2. 输入负数金额（如 `-50` 或 `-12.5`）
3. 点击 **OK**
4. 进入「记一笔」界面，确认类型与金额
5. 点击底部 **保存**

**预期结果**

1. 步骤 4 表单类型应为「**收入**」、金额为绝对值（`50` / `12.5`）、币种 CNY
2. Toast「**记一笔成功**」→ 退回系统桌面
3. 数据：新增 1 条，类型 = 收入、金额 = `50`（或 `12.5`）、日期 = 当天

**关联代码**：`QuickKeypadActivity.confirm()` → `val type = if (cents < 0) "income" else "expense"; val amount = Math.abs(cents)` → deep link 带 `type=income`

---

## 4. 可选边界用例（回归补充）

> 非冒烟必测，作为版本回归或专项验证时选用。

- **TC-QA-E4 handoff 超时兜底**：人为延迟路由渲染 > 5s（如断点 / 慢机）→ 遮罩应自动移除，不应永久黑屏
- **TC-QA-E5 连续两次快捷记账**：保存回桌面后立即再次快捷记一笔 → 验证 `handoffId` 去重（`lastRoutedHandoffId`）与 `completedHandoffId` 不串扰
- **TC-QA-E6 外币**：小键盘切币种为 USD → OK → 表单币种预填为 USD，金额预览按汇率折算
- **TC-QA-E7 二级界面多层级残留**：进入二级界面后再进入更深层（如 `/transaction/[id]`）后 Home → 触发快捷动作 → 验证 `dismissAll` 清理多层栈

---

## 5. 执行检查清单

### 5.1 执行前（Pre-flight）

- [ ] 已安装最新 debug 构建（`npm run android`），版本号与被测一致
- [ ] 设备未开启「不保留活动」/ 后台进程限制（开发者选项中相关项应关闭，否则热启动用例无法构造）
- [ ] 基础数据就位：≥1 账户、≥1 支出分类、≥1 收入分类；清库后需先正常打开 app 一次让 `seedIfEmpty` 播种
- [ ] 桌面已出现「记一笔」快捷动作（动态 shortcut 在 app 首次冷启动、JS 模块加载后才注册；全新安装若长按无此项，先正常打开 app 一次再重试）
- [ ] 记录基线交易总数 `N`（app 概览页 / 交易列表，或 `adb` 查询）

### 5.2 每条用例执行后（Per-case）

- [ ] 实际外显行为与预期一致（Toast 文案 / 界面跳转 / 是否回桌面）
- [ ] handoff 遮罩未异常长时间停留（冷启动 ≤5s，热启动应近瞬时）
- [ ] 数据校验：保存用例 → `N+1` 且金额 / 币种 / 类型 / 日期字段正确；取消用例 → 仍为 `N`
- [ ] 无 ANR / 崩溃（`adb logcat` 无 FATAL，`QuickAddHandoff` 无 `Timed out` 告警）

### 5.3 全部执行后（Post-flight）

- [ ] 连续执行 1.x / 2.x / 3.x 后，数据库交易数 = `N + 保存用例命中数`
- [ ] 无进程残留异常（`adb shell ps | grep financetracker` 行为符合预期：冷启动用例后 app 应已退到后台或销毁）

---

## 6. 执行记录模板

| 用例编号 | 执行人 | 日期 | 设备 / 版本 | 结果 | 缺陷 / 备注 |
| --- | --- | --- | --- | --- | --- |
| TC-QA-1.1 |  |  |  | ☐ Pass ☐ Fail |  |
| TC-QA-1.2 |  |  |  | ☐ Pass ☐ Fail |  |
| TC-QA-2.1 |  |  |  | ☐ Pass ☐ Fail |  |
| TC-QA-2.2 |  |  |  | ☐ Pass ☐ Fail |  |
| TC-QA-3.1 |  |  |  | ☐ Pass ☐ Fail |  |
| TC-QA-3.2 |  |  |  | ☐ Pass ☐ Fail |  |
| TC-QA-E1 |  |  |  | ☐ Pass ☐ Fail |  |
| TC-QA-E2 |  |  |  | ☐ Pass ☐ Fail |  |
| TC-QA-E3 |  |  |  | ☐ Pass ☐ Fail |  |
