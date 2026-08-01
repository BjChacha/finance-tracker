# 页签快速连续滑动接管设计

## 背景

当前页签系统允许 Pan 在程序动画期间启动，但状态机与 UI 仍将上一页保留为 `anchorName`，直到动画完成才把 `targetName` 重锚到中心。因此在 `index → assets` 的释放动画尚未完成时，第二次左滑仍以 `index` 为基准，最多再次选择 `assets`，无法继续切换到 `stats`。

本次修改只修复动画进行中的连续滑动语义，不改变既有的固定四场景、三逻辑槽位、点击方向、动画时长、Router 写入队列和可访问性策略。

## 目标行为

- 任意页签切换动画进行中，新 Pan 都以该动画的 `targetName` 为当前位置。
- 例如 `index → assets` 动画中：再次左滑选择 `stats`，右滑选择 `index`。
- 新手势开始时立即接管 UI 线程视觉状态，不等待旧动画完成。
- 重锚前后已显示页面的屏幕位置连续，不因切换逻辑坐标系而跳帧。
- 新手势取消或未达到提交阈值时，返回刚提升的目标页，而不是旧 anchor。
- 旧动画完成回调、旧 gesture update/end/finalize 均不得覆盖最新意图。
- Router 只提交最终落定页；被连续手势跨过的中间目标不产生过期视觉回滚。
- Reduced Motion 继续保留手势跟手，释放时原子 snap。

## 核心设计

### 目标页提升

UI 协调器新增一个只保存页签索引的共享值，用于表示下一次 Pan 应采用的逻辑 anchor：

- `idle`：等于当前 anchor。
- `animating`：等于当前 target。
- `returning`：等于当前 anchor。
- 完成、外部导航或 Reduced Motion snap 后：与新的视觉 anchor 对齐。

Pan `onStart` 在 UI 线程执行以下原子操作：

1. 递增 gesture session。
2. 取消 translate、opacity 和 pill 动画。
3. 读取旧视觉 anchor、takeover anchor、当前宽度和当前 px 位移。
4. 若 takeover anchor 与旧视觉 anchor 不同，换算新坐标系位移并更新 `anchorIndex`。
5. 设置 takeover anchor 及其直接相邻页的可见拓扑。
6. 保存本次手势的视觉起点和输入起点。
7. 通知 RN 状态机以 takeover target 作为新的 `anchorName` 进入 `dragging`。

### 位移重基

旧 target 在三槽位模型中位于 `-1` 或 `+1` 槽。把 target 提升到中心槽时，用以下关系保持其屏幕坐标不变：

`rebasedDisplacement = currentDisplacement - previousEndpoint`

其中 `previousEndpoint` 是旧 anchor 到旧 target 的归一化动画端点。随后将 `anchorIndex` 更新为 takeover target，并将 `translateX` 更新为重基后的 px 位移。

这使旧 anchor 与相邻 target 的物理位置在接管瞬间保持连续。对于非相邻点击产生的压缩槽位转场，立即切换为 takeover target 的邻接拓扑；被替换的远端旧 anchor 只作为当前视觉 ghost 参与必要的快速淡出，不再参与手势目标计算。

### 视觉位移与手势意图分离

重基后的视觉位移可能仍带有旧动画残余方向，不能用其符号判断第二次手势目标。因此本次 Pan 同时维护两类值：

- 视觉位移：重基位移加本次 `translationX`，用于页面跟手。
- 手势意图位移：仅为本次 `translationX / width`，用于选择 takeover anchor 的左/右相邻页及判断 30% 距离阈值。

速度阈值继续使用当前手势的 `velocityX`。提交后从当前视觉位置动画到新目标端点；未提交或取消则返回 takeover anchor 的中心。

### 状态机接口

`GESTURE_START` 增加 takeover anchor 与重基视觉位移。状态机在接管程序动画时：

- 把 `anchorName` 更新为 takeover target。
- 清除旧 `targetName` 和 `ghostName`。
- 递增 `transitionId`。
- 进入 `dragging`。

`GESTURE_UPDATE` 和 `GESTURE_END` 分别接收视觉位移与本次手势意图位移。目标选择和提交阈值使用意图位移，动画起点使用视觉位移。

状态仍只保存一个当前归一化视觉位移，不引入排队阶段或不可交互阶段。

### Router 一致性

提升动画目标只改变当前交互的视觉/逻辑 anchor，不立即写 Router。后续结果如下：

- 第二次手势提交到下一页：最终动画完成后只提交下一页。
- 第二次手势返回或取消：回到提升后的 target，完成后提交该 target。
- 外部导航到达：保持现有权威取消逻辑，无动画对齐外部路由。

原有 Router 内部写入队列继续串行确认，过期确认只确认队列，不回滚当前视觉状态。

## 测试设计

先增加失败测试，再修改实现：

1. Machine：`index → assets` 动画中开始新 Pan，anchor 立即提升为 `assets`。
2. Machine：提升后左滑提交 `stats`，右滑提交 `index`。
3. Machine：新手势未达阈值或取消时返回 `assets`。
4. Machine：旧动画完成及旧 gesture session 事件被忽略。
5. Controller：接管前后 `index` 与 `assets` 的屏幕坐标保持一致。
6. Controller：不推进计时器，连续三次左滑最终落在 `profile`。
7. Controller：远端点击动画中 Pan 以点击目标为基准。
8. Controller：Router 只提交最后落定页，过期确认不回滚。
9. Reduced Motion：连续手势仍按 takeover target 计算，并在释放时 snap。

## 验证方案

- 运行页签 machine、controller 和 tab bar 专项 Jest。
- 运行完整 Jest 与 TypeScript typecheck。
- 运行 Expo SDK 57 依赖一致性检查。
- 构建 Android Release APK。
- 通过 USB 连接的 Android 真机安装当前构建，清理日志并启动应用。
- 真机执行连续同向滑动、动画中反向滑动、点击远端页后立即滑动、快速交替点击和滑动。
- 检查应用日志中不存在 Worklets、Reanimated、Gesture Handler、React Native 和 Android Runtime 错误。

## 边界与风险

- 首尾页向外拖动继续使用现有 0.5 阻尼，不能产生不存在的目标页。
- 快速连续手势可能跳过中间 Router 写入，这是预期行为；最终 Router 必须与视觉页一致。
- 非相邻点击转场使用压缩槽位，接管时必须重建目标页邻接拓扑，避免同槽位远端页覆盖。
- 所有传入 worklet 的闭包只捕获 primitive 或 Shared Value，禁止捕获完整 controller 或 Gesture 对象。
- 本次不新增依赖，也不修改页面业务组件。
