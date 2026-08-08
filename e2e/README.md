# 记一笔（Quick Add）E2E 冒烟自动化

基于 **adb + bash** 的端到端冒烟测试，覆盖 `docs/smoke-quick-add.md` 的 9 条用例。
兼容 **Android 模拟器**与 **adb 真机**，零额外依赖（仅需 adb，随 Android SDK 附带）。

## 为什么是 adb + bash

- 目标环境是 Windows + MSYS2 bash，Maestro 对 Windows 原生支持有限
- `QuickKeypadActivity` 已 `exported="true"`，可直接 `adb am start` 等价触发快捷动作，
  绕开不可靠的 Launcher 长按（模拟器 / 真机 Launcher UI 不一致）
- 小键盘按钮有稳定 resource-id（`btn0`–`btn9` / `btnOk` / `btnC` / `amountText`），
  RN 表单按文案定位（`保存` / `记一笔`）
- **不改动任何应用代码**即可运行

## 目录结构

```
e2e/
├── README.md              本文档
├── config.sh              应用包名 / Activity / DB / 超时
├── bin/run-smoke.sh       入口：遍历 suites，汇总 Pass/Fail
├── lib/
│   ├── device.sh          adb 探测 / 设备选择 / 唤醒解锁 / locale / 关动画
│   ├── adb-helpers.sh     tap_by_id / tap_by_text / wait_* / am_start_quickadd / press_back ...
│   ├── db.sh              db_tx_count（run-as + sqlite3 读 transactions 行数）
│   └── runner.sh          step / pass / fail / runner_main（每个 suite source 它）
└── suites/                9 条用例，逐条对应 docs/smoke-quick-add.md
```

## 环境前置

1. **adb 可用**：`ANDROID_HOME` 指向 Android SDK（默认 `C:\Users\<you>\AppData\Local\Android\Sdk`）。
   脚本会自动把 `platform-tools` 加入 PATH；也可自行 `export PATH=...:$ANDROID_HOME/platform-tools`。
2. **debug 构建**：数据校验依赖 `run-as` 读取私有数据库，**仅 debug 构建可用**。
   构建：`npm run android`（或 `expo run:android`）。release 构建下保存类用例会在读取 DB 时 FAIL。
3. **快捷动作已注册**：「记一笔」动态 shortcut 在 app 首次冷启动、JS 模块加载后才注册。
   全新安装后请先正常打开 app 一次。本测试用 `adb am start QuickKeypadActivity` 等价触发，
   不依赖该 shortcut 已注册，但真实快捷动作仍建议先注册一次以验证入口。
4. **基础数据**：至少 1 个账户 + 1 个支出分类 + 1 个收入分类（首次启动 `seedIfEmpty` 已播种）。
5. **不要开「不保留活动」**：开发者选项中「不保留活动」必须关闭，否则热启动用例（2.x / 3.x）无法构造。
6. **UTF-8 locale**：脚本会自动选 `en_US.UTF-8` / `C.UTF-8`；若中文（`保存` / `记一笔`）匹配失败，
   手动 `export LC_ALL=en_US.UTF-8` 后重试。

## 运行

```bash
# 跑全部 9 条（自动选取第一个在线设备）
bash e2e/bin/run-smoke.sh

# 指定设备（模拟器或真机 serial）
DEVICE_SERIAL=emulator-5554 bash e2e/bin/run-smoke.sh

# 只跑某条
bash e2e/bin/run-smoke.sh e2e/suites/tc-qa-1.1-cold-save.sh

# 直接跑单条 suite
bash e2e/suites/tc-qa-1.1-cold-save.sh
```

输出示例：

```
=== tc-qa-1.1-cold-save.sh ===
  - baseline tx count = 3
  - cold start: force-stop app
  - trigger quick-add shortcut (adb am start QuickKeypadActivity)
  - type 12.34
  - confirm amount (OK)
  - enter quick-add form
  - tap save
  - verify app returned to desktop
  - verify DB row +1
PASS: TC-QA-1.1 cold-start - save
...
Result: 9 passed, 0 failed (of 9).
```

## 用例清单（与 docs/smoke-quick-add.md 一一对应）

| suite | 用例 | 关键断言 |
| --- | --- | --- |
| `tc-qa-1.1-cold-save.sh` | 冷启动 · 保存 | form 预填 12.34、退桌面、DB +1 |
| `tc-qa-1.2-cold-cancel.sh` | 冷启动 · 取消 | 退桌面、DB 不变 |
| `tc-qa-2.1-warm-l1-save.sh` | 热启动·一级界面 · 保存 | 热启动快速进 form、DB +1 |
| `tc-qa-2.2-warm-l1-cancel.sh` | 热启动·一级界面 · 取消 | 退桌面、DB 不变 |
| `tc-qa-3.1-warm-l2-save.sh` | 热启动·二级界面 · 保存 | 二级残留被清除、form 在前、DB +1 |
| `tc-qa-3.2-warm-l2-cancel.sh` | 热启动·二级界面 · 取消 | 退桌面、DB 不变 |
| `tc-qa-e1-keypad-cancel.sh` | 小键盘阶段取消 | keypad 关闭、焦点回桌面、无 form |
| `tc-qa-e2-zero-block.sh` | 零金额拦截 | OK 无反应、keypad 保留、无 form |
| `tc-qa-e3-negative-income.sh` | 负金额转收入 | 金额 = abs(-12.5)=12.5、DB +1 |

## 模拟器 vs 真机

两者命令完全一致，仅以下差异：

- **设备 serial**：模拟器形如 `emulator-5554`，真机形如 USB serial 或 `IP:port`（无线调试）。
  由 `DEVICE_SERIAL` 或自动选取。
- **动画**：模拟器自动关闭动画提速（`disable_animations_if_emulator`）；真机跳过，不影响正确性。
- **解锁**：两者都执行 `KEYCODE_WAKEUP` + 上滑；已解锁时上滑无副作用。

## 失败排查

| 现象 | 原因 / 处理 |
| --- | --- |
| `cannot read DB` | 非 debug 构建，或设备缺 `sqlite3`。改用 debug 构建；部分真机无 sqlite3 可换模拟器或忽略 DB 断言 |
| `keypad key 'btnX' not tappable` | 数字键连点过快丢键。在 `type_key` 间加 `sleep 0.1` |
| `form title '记一笔' not shown` | 中文 locale 未生效 → `export LC_ALL=en_US.UTF-8`；或 handoff 遮罩未移除（超时） |
| `app not alive after going home` | 开了「不保留活动」→ 关闭该开发者选项 |
| `quick-add form not in foreground (level-2 residual?)` | `useQuickActions.ts` 的 `dismissAll` 逻辑回归 → 真实缺陷，提 issue |
| `tap 'am start' 后无反应` | QuickKeypadActivity 未导出（本仓库已导出）；或 deep link `transactions` 路由失效 |

## 已知限制

- **快捷动作等价触发**：用 `adb am start QuickKeypadActivity` 替代「长按桌面图标」，覆盖
  「Intent → 小键盘」路径，但跳过「系统解析 shortcut」这一层。真实 Launcher 长按不做（不可靠）。
- **Toast 不校验**：「记一笔成功」Toast 瞬时且不进 logcat，改用「退桌面 + DB +1」双断言代替。
- **数字键连点无 sleep**：原生按钮响应快，默认不加间隔；若设备慢导致丢键，按排查表加 `sleep 0.1`。
- **deep_link `transactions`**：3.x 二级界面用 `finance-tracker://transactions` 构造；若该路由变更，
  修改 `warm_level2` 内的 deep link 目标。
- **release 构建**：保存类用例需 DB 校验，仅 debug 可跑；release 下取消类仍可用（仅 UI 断言）。
