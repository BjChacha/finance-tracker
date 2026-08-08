# 记一笔表单：分阶段区块入场渐变

## Context

第三项把 quick-add 改成 `staged-editor` 渐进挂载后，各区块按 stage 逐帧出现（`first_visible` 从 ~460ms 降到 ~300ms）。
但这些区块目前是**硬蹦**出现的 —— 没有任何入场过渡，逐帧挂载的性能收益反而带来了突兀的观感。

目标：给分阶段出现的区块加简单快速的淡入，把"逐帧挂载"从副作用变成有意的揭示节奏。

`motion.base`（180ms）的注释原文就是**"常规内容过渡：表单区块微滑淡入"**
（[motion.ts:12](src/theme/motion.ts#L12)）—— 这个 token 本就是为此预留的，只是从未接上。

## 关键约束（已验证，不是推测）

**1. 分类卡的 `entering` 槽已被占用，且首挂时会误触发滑动。**

[TransactionForm.tsx:1020](src/features/transactions/components/TransactionForm.tsx#L1020) 现为：
```tsx
entering={didMountRef.current ? entering : undefined}
```
这里的 `entering`（[:800](src/features/transactions/components/TransactionForm.tsx#L800)）是**类型切换**用的方向性微滑（16pt 横移，靠 `key={type}` 重挂触发）。

`didMountRef` 在首次提交后的 effect 里就置 true（[:361](src/features/transactions/components/TransactionForm.tsx#L361)），
而 stage 2 要等下一帧 rAF 才到 —— **分类卡挂载时 `didMountRef` 已经是 true**，
所以它会走 16pt 横移，而不是我们要的纯淡入，与其余区块表现不一致。

`didMountRef` 只能区分"首帧 vs 之后"，无法区分"渐进揭示 vs 类型切换"。需要一个独立判据。

**2. 动画只应在渐进挂载时出现。**
全量模式（`renderMode="editor"`，如编辑页、resident editor 预热完成后）`editorStage` 一次性为 15，
所有区块同时挂载 —— 此时加淡入是平白多一帧动画，且与"预热就是为了瞬间可用"矛盾。

**3. 日期块需要多包一层视图。**
`{editorStage >= dateStage && <DateTimeSemanticCards …>}`（[:1179](src/features/transactions/components/TransactionForm.tsx#L1179)）
直接渲染组件，该组件有自己的根 `View` 但不接受 `style` prop，所以只能外包一层 `Animated.View`。
这是本次唯一的额外原生视图开销（一层），可接受。

## 方案

### 判据：`staged-editor` 且该 stage 是本次新揭示的

新增一个 `revealEntering` —— 仅当 `renderMode === "staged-editor"` 时为 `FadeIn`，否则 `undefined`：

```tsx
const revealEntering =
  renderMode === "staged-editor"
    ? FadeIn.duration(motion.base).easing(Easing.out(Easing.cubic))
    : undefined;
```

沿用 [AddTransactionFlow.tsx:122](src/features/transactions/components/AddTransactionFlow.tsx#L122) 已有的
"不该动画时传 undefined" 模式；`reduceMotion` 依赖 reanimated 4 的 `System` 默认值，
与 `TransactionForm` 本文件其余动画的写法保持一致（本文件一律不显式写）。

### 应用到 5 个分阶段区块

| 区块 | 位置 | 当前包裹 | 改法 |
|---|---|---|---|
| 账户卡 | `editorStage >= 8` [:1162](src/features/transactions/components/TransactionForm.tsx#L1162) | `View` | → `Animated.View` |
| 日期卡 | `>= dateStage` [:1179](src/features/transactions/components/TransactionForm.tsx#L1179) | 无（裸组件） | 外包 `Animated.View` |
| 备注卡 | `>= noteStage` [:1195](src/features/transactions/components/TransactionForm.tsx#L1195) | `View` | → `Animated.View` |
| 项目卡 | `>= projectStage` [:1210](src/features/transactions/components/TransactionForm.tsx#L1210) | `View` | → `Animated.View` |
| 保存按钮 | `>= saveStage` [:1281](src/features/transactions/components/TransactionForm.tsx#L1281) | `View` | → `Animated.View` |

### 分类卡：解决 entering 冲突

[:1020](src/features/transactions/components/TransactionForm.tsx#L1020) 改为按来源选择动画 —— 类型切换用方向滑动，渐进揭示用纯淡入：

```tsx
entering={typeSwitchedRef.current ? entering : revealEntering}
```

新增 `typeSwitchedRef`，在 `switchType()`（[:622](src/features/transactions/components/TransactionForm.tsx#L622) 附近，
已在设置 `dirRef` 的地方）置 true。这样：
- 渐进揭示首次出现 → 纯淡入，与其余区块一致
- 用户切换类型 → 保持现有的方向性微滑

转账块（[:1107](src/features/transactions/components/TransactionForm.tsx#L1107)）同理处理，
它目前无 `didMountRef` 守卫，与分类卡写法不对称。

## 验证

- `tsc` + `jest`（基线 422 passed，不得回归）
- **真机观感**：快捷方式 → 小键盘 OK → 录屏确认各区块淡入而非硬蹦
- **类型切换未回归**：在表单内点支出/收入/转账，确认仍是方向性微滑（不是淡入）
- **全量模式无动画**：打开已有交易的编辑页（`renderMode="editor"`），确认区块瞬间出现、无淡入
- **性能不回退**：重测 `QuickAddPerf` 的 `first_visible`，对比第三项基线 277–325ms
- 系统开启「减弱动态效果」后确认退化为瞬切

## 不做

- 不改 stage 划分与推进速度（第三项刚定的每阶段 1 帧）。
- 不给 `AccountEditor` 的分阶段块加动画 —— 它的 stage 块外层是 Fragment，
  改造要引入多个新原生视图，而它做 staged mount 的初衷正是压首屏指令数；本次不动。
- 不引入新的 motion token，复用 `motion.base`。
