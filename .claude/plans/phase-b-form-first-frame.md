# 阶段 b：表单首帧瘦身

## 目标

小键盘 OK → 表单出现，真机实测 **546/555/574ms**。原生埋点分解（`QuickAddPerf`）：

| 阶段 | 耗时 |
|---|---|
| `confirm_start` → `native_confirmed` | 8ms |
| → `main_activity_received` | 88–103ms |
| → `first_visible` | **449–478ms** ← 瓶颈 |
| → `interactive` | 0–1ms |

原生交接只占约 100ms，**82% 的时间花在 RN 渲染表单首帧**。

quick-add 带金额启动，`AddTransactionFlow` 直接进 form 阶段
（[AddTransactionFlow.tsx:50](src/features/transactions/components/AddTransactionFlow.tsx#L50)），
所以首帧要一次性挂出整个表单：分类网格、账户列表、日期/备注/项目、保存按钮。

## 关键发现：能力已存在，只是没接上

`TransactionForm` 已有完整的分阶段挂载（`renderMode="staged-editor"` + `useProgressiveMount`），
15 个 stage 门控覆盖了首帧最重的部分（[TransactionForm.tsx:1010](src/features/transactions/components/TransactionForm.tsx#L1010) 起）。
它已在 [resident-editor-sheet-host.tsx:174](src/components/navigation/resident-editor-sheet-host.tsx#L174) 生产使用 —— 是验证过的路径。

但 `renderMode` 默认 `"editor"`（[TransactionForm.tsx:156](src/features/transactions/components/TransactionForm.tsx#L156)）
→ `editorStage = 15` → 全量首帧。**没有任何调用方传入过 `staged-editor`**，quick-add 自然走了全量路径。

所以本项不是新建机制，而是把已有机制接到 quick-add 上，并按"用户正在等"调节奏。

## 节奏差异（为什么不能照抄预热参数）

现有唯一用法是**后台预热**（不可见时慢慢挂），用 `framesPerStage=4`。
quick-add 是**用户正在等**，目标相反：尽快可见、尽快可用。

`framesPerStage=4` 下 15 个 stage 需 56 帧 ≈ 930ms 才轮到保存按钮
（`saveStage=15`，[TransactionForm.tsx:611](src/features/transactions/components/TransactionForm.tsx#L611)），
比基线更晚可用。改用每阶段 1 帧：约 250ms 全部就位。

## 改动

### 1. `TransactionForm.tsx`
- 新增 prop `stageFramesPerStep?: number`，默认 `4`（保持预热场景不变）。
- `useProgressiveMount(renderMode === "staged-editor", 15, stageFramesPerStep)`。

### 2. `AddTransactionFlow.tsx`
- 新增 prop `renderMode` / `stageFramesPerStep`，透传给 `TransactionForm`。

### 3. `app/quick-add-transaction.tsx`
- 传 `renderMode="staged-editor"` + `stageFramesPerStep={1}`。

## 需要自己验证的盲区

原生埋点的 `interactive` 只看布局与数据完成
（[quickAddPerformance.ts:9](src/features/transactions/quickAddPerformance.ts#L9)），**不看 stage**。
所以它不会反映保存按钮何时可点 —— `interactive=0ms` 在改动后依然会是 0，不能作为"可用"的证据。
必须在真机上单独确认：确认金额 → 保存按钮出现 → 点击能成功落库。

## 验证

- `tsc` + `jest`（基线 422 passed，不得回归）
- 真机 `QuickAddPerf` 采集 3 次，对比 `first_visible`（基线 449–478ms）
- **保存路径回归**：OK → 表单 → 点保存 → 确认 toast 且交易真的写入
- **取消路径回归**：OK → 表单 → 返回，确认第一项的快速退出未受影响
- 转账类型另测一次（`saveStage=12`，stage 阈值与支出不同）

## 不做

- 不改 stage 门控的划分（哪个 stage 挂什么），只改是否启用与推进速度。
- 不动 `isQuickAddFormInteractive` 的判定口径 —— 那会让埋点前后不可比。
- 不改预热场景的 `framesPerStage=4`。
