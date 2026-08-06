# Android 快捷记账卡片入场动画设计

## 背景

快捷记账交接当前会隐藏 React 内容，直到表单可交互且 Sheet 已进入最终状态，再一次性移除原生遮罩并关闭数字键盘。该策略消除了黑帧和旧页面闪现，但 `skipEntryAnimation` 也使卡片失去了从下向上的入场动画。

## 目标

- 恢复快捷记账卡片现有的 `260ms` 上滑和淡入动画。
- 动画期间保留原生数字键盘作为背景，并维持 `38%` 遮罩，避免亮度跳变。
- 继续禁用 Expo Router、Activity 系统过渡以及快捷记账退出动画。
- 不改变普通启动、任务栈清理、数据接口或 iOS 行为。

## 设计

### React 入场门

`SecondarySheetScreen` 在卡片完成测量后调用一个可异步等待的 `beforeEntry`。等待完成后，再从下一帧启动现有 Reanimated 入场动画。回调失败时采用 fail-open，仍继续播放动画，避免永久停留在遮罩界面。

快捷记账将初始遮罩透明度固定为 `0.38`，使原生遮罩移除前后视觉一致。其他 Sheet 默认仍从透明遮罩渐变到 `0.38`。

### 原生三阶段交接

原生交接状态拆分为：

1. `TargetCovered`：React 内容隐藏，原生遮罩覆盖。
2. `TargetRevealed`：恢复 React 内容并移除遮罩，但保留数字键盘 Activity。
3. `InteractiveReleased`：卡片入场完成且表单可交互后，关闭数字键盘并清理会话。

原生模块暴露 `revealQuickAddPresentation(handoffId): Promise<boolean>`。Promise 只在主线程移除遮罩并跨过一个绘制帧后完成。匹配会话返回 `true`；旧 ID 或已取消会话返回 `false`；重复调用保持幂等。

`completeQuickAddInteractive()` 仍是关闭数字键盘和完成清理的唯一入口。若最终完成信号先到达，原生端会先 reveal，再执行最终释放。

## 失败与生命周期处理

- 超时、Activity 销毁或交接被替换时，恢复目标内容并关闭对应的保留源 Activity。
- 卸载或关闭期间取消尚未启动的 JavaScript 动画帧，忽略晚到的异步回调。
- 原生模块不可用、旧 ID 或 reveal 失败时，React 端继续动画，不永久阻塞。
- 系统关闭动画时，沿用 `ReduceMotion.System` 立即进入最终状态。

## 验证

- Jest 验证测量、异步准备、单次启动、卸载取消和 fail-open。
- Android 原生单测验证三阶段迁移、幂等、旧 ID、超时、销毁及提前完成。
- 运行 TypeScript 检查、相关 Jest、原生单测和 Release 构建。
- 不执行 ADB 或真机验证；最终视觉和退出流程由用户手动验收。
