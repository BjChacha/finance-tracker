# Android 启动闪屏与快捷记账交接修复计划

## Goal

彻底消除 Android 新建 `MainActivity` 时的应用图标 Splash、黑帧与旧界面闪现：普通启动使用真实主题纯色底板并在首屏就绪后以 160ms 淡出，快捷记账继续保持“小键盘 → 卡片”的连续交接。

## Constraints

- 以当前工作区与真实 Android 设备行为为权威证据。
- 保留并绕开现有大量未提交改动，不覆盖无关工作。
- 修改 Expo 代码前必须查阅 Expo SDK 57.0.0 的版本化文档。
- 在 `brainstorming` 设计获得用户确认前不修改业务代码。
- 解释与文档正文使用简体中文；代码、标识符、注释与提交信息使用 English。

## Phases

### Phase 1: 恢复上下文并建立复现链路

Status: completed

- [x] 检查快捷方式注册、原生 Intent、Expo Router 路由和快捷记账页面。
- [x] 检查现有设计、测试与调试产物，区分用户改动和本任务可修改范围。
- [x] 确认 ADB 设备、安装包与可复现条件。

### Phase 2: 收集运行时证据并定位根因

Status: completed

- [x] 通过 ADB 记录 Activity/window/React Native 日志与必要的视频或截图。
- [x] 对照冷启动、热启动、后台恢复三种入口时序。
- [x] 将观察结果映射到导航/窗口生命周期代码。

### Phase 3: 设计与用户确认

Status: completed

- [x] 提出 2–3 个修复方案及取舍，推荐最小根因修复。
- [x] 形成设计说明并请求用户确认。
- [ ] 将获批设计写入 `docs/superpowers/specs/` 并完成自检。

### Phase 4: 实施修复

Status: in_progress

- [ ] 生成 Manifest 启动主题与 Android 12+ 透明覆盖主题。
- [ ] 实现普通启动纯色覆盖层、160ms 淡出、超时和生命周期清理。
- [ ] 扩展主题缓存与 JS 原生接口。
- [ ] 实现 Router 导航、布局与双帧就绪门。
- [ ] 添加启动门与主题映射测试。

### Phase 5: 验证与完成审计

Status: pending

- [ ] 运行定向测试、类型检查及适当的构建检查。
- [ ] 在真机重复验证原始操作链路，确认无黑屏或其他页面闪现。
- [ ] 对目标逐项审计证据并记录已知限制。

## Decisions

- 使用独立计划目录，避免覆盖仓库中其他任务的计划文件。
- 在掌握代码与运行时证据前不预设是动画、路由还是 Activity 重建问题。
- 用户确认所有 Android 新建 `MainActivity` 均移除系统图标 Splash；普通启动显示真实主题纯色，首屏就绪后 160ms 淡出。
- 快捷记账保留 `NEW_TASK | CLEAR_TASK`，等待阶段继续显示原生小键盘，不插入普通启动纯色页。
- `AppTheme.TransparentLaunch` 必须在 Manifest 主题层生效；运行时 `setTheme()` 只负责选择正常/快捷记账内容主题。

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Windows sandbox 无法创建 `setup_marker.json` | 读取技能说明时首次失败 | 按沙箱提示以受控提权重新执行，只读操作成功 |
| `apply_patch` 无法自动创建计划父目录 | 首次写计划文件失败 | 改为先显式创建精确目录，再使用 `apply_patch` |
| 沙箱拒绝在 `.planning` 下创建目录 | 首次 `New-Item` 失败 | 受控提权后仅创建本任务目录，成功 |
| Windows `rg` 不接受路径参数中的 `*.xml` glob | 首次聚焦读取资源失败 | 后续使用目录参数配合 `--glob '*.xml'` |
| PowerShell 无法解析 `adb` 命令 | 首次设备探测失败 | 改为查找 Android SDK 中的 `platform-tools/adb.exe` 并使用绝对路径 |
