# SmartPerfetto 快捷记账性能分析设计

## 目标

使用 SmartPerfetto CLI 对 Android 桌面快捷动作“记一笔”从原生键盘确认到 React 表单可交互的链路进行分段测量，形成可复现的 Trace、确定性 SQL/Skill 证据及优化前后统计结果。

验收目标如下：

- 热启动 `ConfirmToInteractive` P95 不高于 300ms。
- 常规冷启动 `ConfirmToInteractive` P95 不高于 800ms。
- 极限冷启动单独报告，不混入常规冷启动指标。
- 30 次常规验证均进入金额正确的记一笔表单，不出现灰屏或返回首页。

## 工具与运行模式

- 使用 npm 全局安装 `@gracker/smartperfetto@1.2.1`，不修改项目依赖。
- 使用 Windows 上现有 Node.js 24 和 Android SDK ADB。
- 设置 `SMARTPERFETTO_AI_ENABLED=false`，仅使用 Trace 采集、SQL 查询、确定性 Skill 和批量 Skill。
- Trace 与报告保存在用户级 SmartPerfetto 数据目录，不提交到仓库。
- 只使用 Android 12 及以上真机作为性能结论来源。

## 埋点设计

原生侧在用户点击确认后创建一次 handoff 性能会话，以 `handoffId` 关联原生和 React 阶段。会话创建两个异步 Trace 区间：

- `QuickAdd/ConfirmToFirstVisible`
- `QuickAdd/ConfirmToInteractive`

链路中增加以下固定名称的阶段切片：

- `QuickAdd/NativeConfirm`
- `QuickAdd/MainActivityHandoff`
- `QuickAdd/RouteRender`
- `QuickAdd/FormDataReady`

`FirstVisible` 在快捷记账路由完成布局后的下一帧结束。`Interactive` 在表单已经布局，并且账户、分类、项目、汇率四项初始查询均完成后的下一帧结束。推荐数据不阻塞交互完成点。

原生控制器同时输出标签为 `QuickAddPerf` 的结构化日志，包含 handoff、阶段、单阶段耗时和累计耗时。异步 Trace API 仅在 Android Q 及以上启用；日志计时在所有支持版本可用。重复或过期的完成通知必须幂等，不得关闭其他 handoff 的区间。

## 数据流与接口

- `QuickKeypadActivity` 在有效确认后启动性能会话，并在启动 `MainActivity` 前记录原生阶段。
- `QuickAddHandoffController` 管理 Trace cookie、开始时间、首帧完成和交互完成状态。
- Expo 模块保留 `completeQuickAddHandoff(handoffId)`，并新增内部同步桥接 `completeQuickAddInteractive(handoffId)`。
- `TransactionForm` 新增可选的 `onInteractive` 回调；只有初始数据和布局均完成时触发一次。
- `AddTransactionFlow` 将回调传递到表单，快捷记账路由负责调用原生完成接口。

这些接口仅供应用内部使用，不修改持久化格式和外部公共 API。

## 采集与分析

SmartPerfetto startup 配置必须包含 ActivityManager、WindowManager、Dalvik、scheduler、FrameTimeline，并采集 gfx、view、input、Binder、CPU 频率和磁盘证据。

根因阶段分别采集热启动、常规冷启动和极限冷启动各 3 条代表 Trace。确定性分析使用：

```powershell
smp skill quick-add-warm-01.perfetto-trace startup_slow_reasons --params '{"package":"com.anonymous.financetracker"}' --format json
smp query quick-add-warm-01.perfetto-trace --sql "select name, ts, dur from slice where name glob 'QuickAdd/*' order by ts" --format json
smp batch skill startup_analysis quick-add-warm-01.perfetto-trace quick-add-cold-01.perfetto-trace quick-add-stress-01.perfetto-trace --params '{"package":"com.anonymous.financetracker"}' --out quick-add-report.html --json-out quick-add-result.json
```

统计阶段使用轻量 `QuickAddPerf` 日志执行热启动 30 次、常规冷启动 30 次、极限冷启动 10 次。重型 Trace 只用于代表样本和异常样本。

## 错误处理与验证

- 没有连接 Android 12 及以上真机时，安装、代码和构建可以继续，但 Trace 采集必须停止。
- SmartPerfetto doctor、ADB、trace processor 或必需 Trace 数据源失败时，不生成性能结论。
- 原生 async slice 在取消、超时或 handoff 被替换时必须安全结束，避免污染后续 Trace。
- TypeScript 检查、Jest、Android 单元测试和 release 构建必须通过。
- 优化建议只依据 Trace 与结构化耗时证据排序，不把静态推测写成已确认根因。
