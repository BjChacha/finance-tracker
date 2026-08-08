# Tab 场景懒挂载

## 目标

`TabPagerViewport` 当前无条件渲染全部 4 个 tab 场景（[tab-pager.tsx:1071](src/components/navigation/tab-pager.tsx#L1071)），
`TabPagerScene` 对非活跃场景只做视觉隐藏（`pointerEvents`/`accessibilityElementsHidden`），没有懒挂载
（[tab-pager.tsx:1043](src/components/navigation/tab-pager.tsx#L1043)）。

结果：任何一次挂载 tab 世界都要付 4 个页面的代价。最贵的是 `stats`
（7 个 query hook + 4 个 SVG 图表，[app/(tabs)/stats.tsx:168](app/(tabs)/stats.tsx#L168)），
而它与首屏 `index` 并不相邻（顺序 `index(0) assets(1) stats(2) profile(3)`）。

## 核心约束（已从代码验证，不是推测）

1. **可见性在 UI 线程，挂载在 JS 线程。**
   所有 opacity 写入都是 `"worklet"`（[tab-pager.tsx:79](src/components/navigation/tab-pager.tsx#L79)、
   [:88](src/components/navigation/tab-pager.tsx#L88)），挂载是 React state。
   因此**挂载集必须始终是可见集的超集**，且不能靠 worklet 回调异步补挂载。

2. **手势起手时相邻场景必须已挂载。**
   `Gesture.Pan().onStart` 在 UI 线程同步调用 `configureGestureTakeoverVisibility`，
   把相邻场景设为 opacity=1（[tab-pager.tsx:798](src/components/navigation/tab-pager.tsx#L798)）。
   handler 内无 `runOnJS`，`scheduleOnRN` 是异步的 —— 补挂载来不及，会白屏。
   → **anchor 及其左右邻居必须常驻挂载。**

3. **非相邻跳转必须立刻可见。**
   `pressTab("profile")` 从 index 直跳时，profile 的 opacity 立即为 1
   （现有测试 `tab-pager.test.tsx:127` 锁定了该行为）。
   但 `pressTab` 走 JS 线程 `applyRef` → `setState`（[tab-pager.tsx:891](src/components/navigation/tab-pager.tsx#L891)），
   与场景挂载在同一次 React 提交 → 安全，只要挂载集把 `targetName`/`ghostName` 算进去。

4. **`stateRendersSame` 已包含所需信号。**
   `anchorName`/`targetName`/`ghostName` 都参与比较（[tab-pager.tsx:251](src/components/navigation/tab-pager.tsx#L251)），
   所以挂载集的三个输入都会触发重渲染。无需改动状态机。

## 方案：邻居预挂载 + 挂载后常驻

挂载集 = `{anchor 及左右邻居} ∪ {targetName} ∪ {ghostName} ∪ {已挂载过的}`

- **常驻**：已挂载的场景不再卸载。避免来回滑动反复重建（重建会丢滚动位置、重跑 query），
  也让稳态行为与今天完全一致。
- **收益**：冷启动落在 `index` 时只挂 `index`+`assets`，跳过 `stats`（7 query + 4 SVG）与 `profile`。

## 改动

### 1. `src/components/navigation/tab-pager-machine.ts`
新增纯函数 + 单测：
```ts
export function mountedTabNames(
  state: Pick<TabPagerState, "anchorName" | "targetName" | "ghostName">,
  previouslyMounted: readonly TabRouteName[],
): readonly TabRouteName[]
```
放这里是因为该文件已是无 React 依赖的纯逻辑层（`canonicalTabIndex`/`logicalTabSlot` 都在此），便于直接测。

### 2. `src/components/navigation/tab-pager.tsx`
- `TabPagerViewport` 用 `useRef` 累积已挂载集合，按 `mountedTabNames` 过滤 `props.scenes`。
- `TabPagerScene`：未挂载的场景返回 `null` 占位（保留 `Animated.View` 外壳与 `testID`，
  这样 `logicalTabSlot` 的位移计算和现有测试的 `getByTestId` 都不受影响），
  已挂载的照常 `props.scene.render()`。

### 3. 测试
- 改写 `tab-pager.test.tsx:91` 的 "eagerly mounts all four scenes"：
  锚点 index 时断言 `stats`/`profile` **未渲染内容**，而 `index`/`assets` 已渲染。
- 新增：滑到 assets 后 stats 补挂载；非相邻 `pressTab("profile")` 时 profile 同帧挂载；
  已挂载的场景在离开后不被卸载。
- `tab-pager-machine.test.ts` 补 `mountedTabNames` 的纯函数用例。

## 验证

- `npx tsc --noEmit` + `npx jest`（基线 414 passed，不得回归）
- 真机复测：`am start` 冷启动，logcat 断言 **首屏不出现 `RNSVG`**（stats 未挂载的直接证据）
- 真机手感回归：四个 tab 依次滑动 + 非相邻点击跳转，确认无白屏
- Perfetto 对比冷启动 `UPDATE_LAYOUT numInstructions` 与主线程 busy

## 不做

- 不动状态机的 phase/命令流。
- 不改 opacity/位移逻辑 —— 本项只改"挂不挂载"，不碰"可不可见"。
- 不引入卸载策略（内存换手感，且当前 4 个 tab 规模无必要）。
