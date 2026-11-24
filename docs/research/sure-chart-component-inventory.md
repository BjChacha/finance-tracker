# Sure 图表与仪表盘组件全景清单

> 调查对象:[we-promise/sure](https://github.com/we-promise/sure) 最新 main 快照(2026-11-24 拉取,`.tmp/sure2`)。
> 上一次对比报告(`sure-competitive-analysis.md`)基于 11-11 快照,两周内已有变化:**新增 `multi_series_chart`**,`spending_treemap` 保留(上次遗漏未列)。
> 本文只回答一个问题:Sure 用什么组件把数据画出来。

---

## 一、技术底座:没有任何图表库

| 检查项 | 结果 |
|---|---|
| `package.json` 里的图表依赖 | **无**(仅 `@biomejs/biome`) |
| `importmap.rb` 里的图表库 | **无**(无 chart.js / apexcharts / echarts / recharts) |
| 实际绘图方式 | **D3 v7.9.0 + d3-sankey 0.12.3,全部手写 SVG** |

importmap 全量 pin 了 D3 子包,能反推他们用到哪些能力:

- `d3-scale` / `d3-scale-chromatic` / `d3-shape`(标度与路径)
- `d3-hierarchy`(→ 树状图 treemap)
- `d3-sankey`(→ 桑基图)
- `d3-brush`(→ 时间序列框选缩放)
- `d3-zoom`(→ 桑基缩放)
- `d3-time` / `d3-time-format` / `d3-format`(轴与数字)
- 另有**手写 shim**:`shims/d3-array-default.js`、`shims/d3-shape-default.js`(修 D3 子包默认导出)

**代码规模**(自绘的全部代价):

| 部分 | 行数 |
|---|---|
| 11 个图表 Stimulus controller | **5112** |
| 9 个图表工具模块(utils) | **875** |
| 仪表盘布局三件套 | 257 |
| **合计** | **≈ 6000 行** |

呈现层是 **Stimulus controller 生命周期**:`connect()` 装图 → `ResizeObserver` + `turbo:load` 重装 → `disconnect()` 拆图。

---

## 二、图表组件清单(11 个)

| 控制器 | 图形 | 行数 | 用在哪 |
|---|---|---|---|
| `time_series_chart_controller.js` | 折线 + 渐变面积 | **907** | 净值图、账户图表、onboarding 偏好预览 |
| `goal_projection_chart_controller.js` | 目标储蓄投影 | **723** | 目标生命周期面板 |
| `preview_sankey_chart_controller.js` | 现金流桑基(预览版) | **651** | 看板现金流预览 |
| `sankey_chart_controller.js` | 现金流桑基(主) | **627** | 看板现金流卡片 |
| `loan_payoff_chart_controller.js` | 贷款还款多序列 | **623** | 账户图表(贷款类) |
| `donut_chart_controller.js` | 甜甜圈/进度环 | **382** | **4 处复用**:支出构成、现金流构成、贷款还款进度、目标进度环 |
| `multi_series_chart_controller.js` | 任意多分类折线 | **361** | 报告页「分类趋势」(新增) |
| `spending_chart_controller.js` | 累计双线对比 | **346** | 看板消费节奏 |
| `spending_treemap_controller.js` | 树状图 | **229** | 报告页「支出 vs 常态」 |
| `bar_chart_controller.js` | 分组柱状 | **195** | 看板资金流(月收入/支出) |
| `net_worth_chart_controller.js` | 净值(薄封装) | **68** | 报告页净值 |

### 逐个要点

**1. `time_series_chart_controller.js`(907 行,最重)**
- 折线 + 渐变面积;净值、账户余额、sparkline(细线无交互)三处复用
- **`d3-brush` 框选缩放**:拖拽选区即切自定义区间,<4px 视为点击
- 虚线参考线 + 大小双圆点 + 趋势箭头(箭头按趋势语义着色)
- 有 `net_worth_chart_controller.js` 做 68 行薄封装供报告页专用

**2. 桑基图(最大子系统,共 627+651+238+875 行工具)**
- `cash_flow_chart_data.mjs` 服务端数据整形 → 客户端绘图
- 专用工具 6 个:`sankey_zoom`(节点点击缩放)、`sankey_labels`(标签避让,测量后重排)、`sankey_comparison`、`sankey_subcategories`(子分类列)、`sankey_align`(汇点对齐)、`sankey_preview_analytics`
- 宽度阈值以下**丢掉子分类列**(五列在手机上只剩 60px)
- 节点点击 → 下钻到该分类筛选的交易列表
- 结构节点(现金流/结余)与分类节点行为分流

**3. `donut_chart_controller.js`(复用最广)**
- 最小角 0.02rad(小分类不消失)、超支段置顶、未用额末位
- **hover 时中心切换为该分类的金额 + 占比**、分段外扩 3px
- 点击下钻;同一个 controller 服务「支出构成 / 现金流构成 / 贷款进度 / 目标环」四种语义

**4. `spending_treemap_controller.js`(设计最巧)**
- **面积 = 本期净支出,填充色 = 与「常态」的偏离幅度**
- 用 `color-mix(in srgb, var(--color-success) N%, var(--color-container))` 做 6 档:
  `less(-100%~-50%) / slightly_less / normal(±15%) / slightly_more / more / much_more(>100%)`
- 最强红停在 80%、最强绿停在 50%(深色模式绿偏亮),保证两种主题下文字仍达 AA 对比度
- 点击色块 → 该分类该周期的交易列表
- 用 `d3-hierarchy`

**5. `multi_series_chart_controller.js`(新增,361 行)**
- 为报告页「分类趋势」而写:任意条数序列(其余图都是单/双序列)
- **跨年时自动加年份行**:月份轴跨年时 "Jan" 会重复且不知属哪年 → 底部多一行年份,并在每年起点画一条淡虚线贯穿绘图区
- 密集序列(>12 点)不打点,靠 hover 焦点圆显示精确值
- 负值(只有退款的月份)时保留 0 轴,让正负号可读
- 一年只有一个 bucket 时把点和标签居中,总额仍可见

**6. `bar_chart_controller.js`(195 行)**
- 月收入 vs 支出分组柱;**支出柱故意用中性灰**,红色只留给坏消息
- x 轴标签三级降级(全称 → 缩写 → 隔个显示)
- 进行中的月份柱 50% 透明

**7. `spending_chart_controller.js`**
- 当月 vs 上月**累计支出双线**;同一日月轴;头部对比只比已流逝天数(长月尾部折进最后一点)

**8. 贷款/目标两个专用图**
- `loan_payoff_chart`:actual(实线)/ scheduled / projected / extra(虚线)四序列 + 本金/利息占比阴影
- `goal_projection_chart`:储蓄轨迹与达成预测

---

## 三、仪表盘组件(chrome / 布局层)

| 控制器 | 行数 | 职责 |
|---|---|---|
| `dashboard_masonry_controller.js` | 72 | **实测每卡高度 → 算 `grid-row: span N` + `grid-auto-flow: dense`** 拼紧密瀑布流;只在实际多列时生效,单列清空 span 交给普通文档流 |
| `dashboard_section_controller.js` | 87 | 卡片折叠/展开 + `PATCH /dashboard/preferences` 持久化(带 ARIA `aria-expanded`) |
| `dashboard_widget_size_controller.js` | 98 | 卡片高度预设 / 宽度切换 |

配套(服务端):

- `PagesController#dashboard` 声明 `dashboard_section_builders`(每个 widget 一个 lambda,含 partial / 标题 / locals / 是否可见)
- `DASHBOARD_SECTION_LAYOUTS` 布局护栏:`col_span`(single/full)、`grow`、`min_height`、`width_toggle`
- `DASHBOARD_HEIGHT_PRESETS`(compact 208 / auto 288 / tall 416)
- `sortable_list_controller` 拖拽重排(按住 800ms) + 键盘方向键重排
- `UI::PeriodPicker` 周期选择(Turbo frame 内刷新)
- 关键设计:**隐藏的 widget 连查询都不执行**(builder 不被调用)

masonry 的注释点出了实现要点:row gap 归零后用「每张卡的 span 补上等于列间距的空轨道」,否则整数 row-span 会因行距在垂直方向累积出可见的不均匀间隙——纯细节但很见功力。

---

## 四、服务端渲染组件(零 JS,SVG 由 Ruby 生成)

| 组件 | 说明 |
|---|---|
| `DS::Sparkline`(Ruby,55 行) | **纯服务端 SVG**:一条 polyline + 每点一个圆(值为 0 时空心)+ 隔一显示标签;几何全在 Ruby 里算,调用方只传日期序列,颜色走 `currentColor`。注释明确「提取自账单详情的 12 个月还款历史,让视图别再手搓 SVG——裸 SVG 属于 DS 原语」 |
| `DS::ProgressRing` | 单弧进度环(success/warning/destructive 三色) |
| `shared/_progress_circle.html.erb` | 圆形进度 |
| `shared/_trend_change.html.erb` | **趋势的标准呈现**:色值来自 `trend.color`,持平显示「无变化」,否则 `金额 + (图标 + 百分比) + 对比标签`,数字用 `font-mono` |
| `shared/_trend_figure.html.erb` | 表格单元格里的两行趋势:带符号金额 + 百分比,同色;可选 note(次级文字)说明这个数字省略了什么 |
| `DS::Table` / `DS::Section` / `DS::Card` / `DS::Pill` / `DS::SegmentedControl` / `DS::Disclosure` | 数据容器与筛选原语 |
| `shared/_sparkline.html.erb` | Sparkline 的视图侧包装 |

**分工原则**:能用 Ruby 静态画出来的(细线 sparkline、进度环、趋势行)就绝不下发 JS——首屏零闪烁、无 hydrate 成本。

---

## 五、共用基础设施(跨图表的统一契约)

| 模块 | 行数 | 职责 |
|---|---|---|
| `utils/settled_resize.js` | **294** | **防抖重绘**:拖拽/侧栏动画期间容器每帧变尺寸,全量重绘会卡顿 → 先瞬时**拉伸**现有 SVG,待宽度过渡结束或静置 `settleMs` 后再真正 `redraw`。只拉伸宽度(高度变化立即重绘,因为垂直拉伸会扭曲桑基流);提供 `layoutChanges(from,to)` 钩子让「布局随宽度变」的图(桑基丢列)立刻重绘;`data-settled-resize-keep-width`(节点条保持宽度)、`data-settled-resize-joins`(连线跟着条走)两个标记;`margins:{left,right}` 让边缘元素不随拉伸漂移 |
| `utils/chart_tooltip.js` | 39 | **Tooltip 视觉契约的单一来源**:`chart-tooltip text-primary text-sm font-sans absolute pointer-events-none z-50 privacy-sensitive` + 上下文行 / 数值行两类常量。注释记录动机:此前 time-series 漏了 `text-primary` 和 `z-50`,各控制器样式漂移。本体是设计系统里的 `.chart-tooltip` 组件类(Tailwind 阴影工具类无法把 ring 和自定义投影组合) |
| `utils/cash_flow_chart_data.mjs` | 103 | 服务端 → 客户端的现金流数据整形 |
| `sankey_*.mjs`(6 个) | 492 | 桑基专用:缩放 / 标签 / 对比 / 子分类 / 对齐 / 预览分析 |

---

## 六、呈现哲学(从代码注释反推)

1. **颜色表达好坏,不表达正负**:绿=少花/盈余/达标,红=多花/赤字/超支,中性 inset=正常。同一个 `+12%`,支出着红、收入着绿,由 `Trend#favorable_direction` 在模型层统一裁决
2. **红色是稀缺资源**:资金流的支出柱、上月对比曲线**故意用中性灰**,避免整屏红色导致麻痹
3. **一张图只讲一件事**:折线=时间,柱子=周期对比,环=构成,桑基=流向,树状图=构成+偏离,表格=明细
4. **总数与构成分工**:卡片放「大数字 + 趋势行」,图表只负责形状
5. **预算/目标进度也复用它自己的环**:donut controller 服务四种语义
6. **隐私是一等公民**:所有金额元素挂 `privacy-sensitive`,图表 tooltip 也在契约里
7. **无障碍**:图有 `aria_label`,折叠有 `aria-expanded`,排序有键盘等价操作

---

## 七、与我们项目的对照

### 我们已有的(6 类自绘 + gifted-charts)

`DonutChart` / `TrendLineChart` / `CompareBarChart` / `CalendarHeat` / `CategoryTreemap` / `HBarList`,外加 `sparkline-geometry`、`smooth-line`、`donut-layout`、`treemap-layout`、`line-axis` 等纯几何模块。

### 差距

| 缺口 | Sure 的做法 | 对我们的价值 |
|---|---|---|
| **桑基图** | 主 + 预览两个实现,6 个专用工具 | 中:资金流向是强需求,但 600+600 行成本高,可先做简化两层 sankey |
| **多序列折线** | `multi_series_chart` + 跨年年份行 | **高**:我们 stats 只有单双序列,跨年月份轴大概率也有「Jan 重复」问题 |
| **偏离度着色树状图** | 面积=金额、颜色=与常态的偏离 6 档 | **高**:我们 treemap 只按分类色着色,缺「这个月这类花超了没」的信息 |
| **投影/还款曲线** | goal_projection + loan_payoff | 低:我们无贷款模块,目标模块也简单 |
| **零 JS 服务端 SVG** | `DS::Sparkline`(Ruby 画) | **高**:RN 里对应「用最少的 view 画 sparkline」,我们的 `sparkline-geometry` 已是这个思路,可推广 |
| **settled_resize** | 拖拽期间拉伸、静置后重绘 | **高**:RN 的 `onLayout` 在同一手势里会连发多次,我们的 PeriodControl 切换就吃过布局抖动 |
| **tooltip 视觉契约** | 单一常量模块 + 注释记录漂移史 | **中**:我们各图表 tooltip 样式容易漂移,可抽 `<ChartTooltip>` |
| **颜色语义收敛** | `Trend#favorable_direction` 在模型层 | 我们已做(`src/lib/trend.ts` 的 `trendColor`),方向一致 |

### 结论

Sure 的图表体系是「**不引库、全手写、但把共用件抽干净**」的路线:6000 行自绘换来了完全的控制力(缩放、下钻、响应式丢列、跨年轴、偏离着色),代价是每加一种图都要重写一遍生命周期。

对我们最有借鉴价值的三件事,按性价比排序:

1. **`multi_series_chart` 的跨年轴处理**——我们的 stats 月份轴跨年时几乎肯定有同样的「Jan 重复」问题,修起来是纯增量
2. **树状图的「偏离常态」颜色编码**——现有 treemap 只要换填充色规则,信息量立刻翻倍(面积给构成、颜色给异常)
3. **`settled_resize` 的思路**——不是抄代码,而是抄「手势/动画期间不做重活」的纪律
