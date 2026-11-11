# Sure(we-promise/sure)深度分析 × finance-tracker 对比改进报告

> 分析对象:[we-promise/sure](https://github.com/we-promise/sure) —— Maybe Finance 的社区延续版(AGPLv3),耗资近百万美元打造的个人财务应用,开源后由社区维护。
> 源码快照:`.tmp/sure`(main 分支,2026-11 快照,仅供研究,勿提交入库)。
> 分析方式:4 路并行深挖(数据模型 / 仪表盘图表 / 用户旅程与移动端 / 本项目现状)+ 关键文件一手复核,所有结论附代码出处。

---

## 一、项目全景与架构定位

| 维度 | Sure | finance-tracker(咱们) |
|---|---|---|
| 定位 | 云端聚合型个人财务中枢(自托管优先) | 本地优先的中文个人记账工具 |
| 后端 | Ruby on Rails + PostgreSQL + Redis + Sidekiq | 无(纯客户端) |
| 前端 | Hotwire(Turbo+Stimulus)+ D3 自绘 SVG 图表 | Expo/RN + react-query + 自绘/gifted-charts |
| 移动端 | Flutter,**companion 定位**(服务器是唯一真相) | 本体就是移动端,SQLite(drizzle)本地存储 |
| 桌面端 | macOS 壳 | 无 |
| 数据获取 | **33 家银行/交易所/估值 provider 自动同步** | 手动记账 + 一句话 AI 记账 + CSV 导入 |
| AI | 服务端 Agent(约 40 个 function tools)+ MCP + LLM 分类 + 洞察生成 | 端侧 DeepSeek:一句话记账 + 月/季/年消费报告 |

一句话:Sure 解决"**钱在哪、净值几何**"(聚合、净值、投资、多端);咱们解决"**快速记下来、看懂花哪了**"(录入速度、本地隐私、中文场景)。两者重叠区是**统计呈现、分类、预算**,这是本次对比的主战场。

---

## 二、用户使用旅程

### 2.1 Sure 的旅程(代码证据)

1. **注册即向导**:登录自研(密码 + OTP 两步验证 + OIDC SSO,`app/controllers/sessions_controller.rb`);新用户强制进 onboarding(`concerns/onboardable.rb` 未完成一律重定向)。
2. **Onboarding 三步**(`app/views/onboardings/`,wizard 布局):
   - 个人资料:头像/姓名;单人 vs 家庭;国家按浏览器 locale 预填并联动默认货币;
   - 偏好:主题/语言/货币/日期格式,**右侧实时预览卡**用假数据渲染金额与迷你走势图;
   - 目标:8 个多选(统一账户/现金流/预算/伴侣协作/投资/AI 洞察……)。
3. **刻意不在 onboarding 里连银行**:首次 dashboard 是"No accounts yet"图表占位 + Add account;手动输余额路径永远在前,银行连接折叠在后(渐进式披露,`docs/onboarding/guide.md`)。
4. **日常回路**:每日 02:22 自动同步(`auto_sync_scheduler.rb`)→ 首页 insights_feed 置顶(夜间生成的主动洞察)→ 点开 Sankey 看流向 → 规则/LLM 自动分类 → 预算环。
5. **导入向导五步**(Upload → Configuration → Clean → Confirm → Publish):列映射/数字格式(4 种国际格式)/金额策略(signed vs 独立类型列);**Clean 步表格内逐行修错**;**Publish 前 dry-run 汇总 + 发布后可整体 revert**;去重命中则**更新原交易**并 `import_locked` 防银行同步覆盖(`app/models/import.rb`、`transaction_import.rb`)。

### 2.2 咱们的旅程

装机即用(无向导)→ FAB 两段式记账(计算器键盘 → 1915 行大表单,最快 4 步)或一句话记账 / 桌面快捷方式原生键盘 → 首页周期切换看统计 → AI 报告周期结束后自动生成。

### 2.3 差距与启示

- 咱们的**录入速度优势明显**(quick-keypad 原生快捷方式 + NL 记账是 Sure 移动端没有的——它的移动端快速记账只是普通表单);但**首次启动空态引导缺位**:新用户面对空 dashboard,没有"建第一个账户/导入账单/记第一笔"的引导链。
- Sure 的"导入可逆"哲学(dry-run + revert + 批次撤销)是咱们导入器最值得补的一块,详见 §10。

---

## 三、UI/UX 体系

### 3.1 Sure 的设计体系

- **DS::* 组件层**(alerts/badges/buttons/dialogs/menus/tables/tooltip/sparkline/progress-ring),设计 token 全部走 CSS 变量(`bg-container`/`text-primary`/`--color-success`),仓库规约禁止裸 Tailwind 色值与裸 SVG;
- **服务器端零 JS 组件**:`DS::Sparkline`(纯 SVG)用在账户行、趋势行,首屏无闪烁;
- **tabular-nums 全覆盖** + 金额元素挂 `privacy-sensitive` 类(配合隐私遮蔽);
- **空/加载态成体系**:无账户插画占位、<2 点虚线+空心圆、donut 中心默认文案、同步中 animate-pulse、fetch 三态(loading/error/empty);
- **键盘与无障碍**:dashboard 卡片可聚焦、Enter 抓取后方向键重排、aria-grabbed/aria-label 完整。

### 3.2 呈现哲学(最值得抄的思路)

> **卡片放"大数字 + 着色趋势行",图表只管三件事:时间(折线)、构成(环形)、流向(Sankey);表格管明细。**

- 收入/盈余/支出下降 = 绿;赤字/超支/支出上升 = 红;**money flow 的支出柱与上月曲线故意用中性灰**(源码注释明示,`bar_chart_controller.js:69`)——红色只留给"坏消息",避免满屏红色麻痹;
- `Trend` 模型带 `favorable_direction`(`trend.rb:28-35`):同样是"+12%",支出着红、收入着绿,方向语义在模型层统一,不是每个页面自己写 if;
- 环比只比**已流逝天数**:当月 vs 上月曲线画满但头部数字只比到今天,长月尾部折进最后一点(`fold_extra_days`,`pages_controller.rb:732-742`)。

### 3.3 咱们的现状

4 tab + 悬浮 TabBar + 中央 FAB 手感好;`tabular-nums` 已在交易行使用但未全量;无隐私遮蔽、无应用锁;ChartEmpty 仅文字;趋势着色未确认方向语义统一。

---

## 四、仪表盘:模块与数据呈现逻辑

### 4.1 Sure 的 8 个 widget(`pages_controller.rb:166-261`)

| widget | 内容 | 数据来源 |
|---|---|---|
| insights_feed | 主动洞察流(置顶,preview 门控) | `insights` 表(夜间生成) |
| cashflow_sankey | 资金流向 Sankey(可放大全屏、按账户/分类分组) | IncomeStatement 净额分类 |
| money_flow | 近 6 月收入/支出分组柱状 + 汇总行 | `totals_for` ×6 月 |
| spending_trend | 当月 vs 上月**累计支出双线** | `daily_expense_series` |
| outflows_donut | 支出构成环形 + 中心切换 + 图例列表 | `net_category_totals` |
| investment_summary | 组合市值/未实现收益/Top 持仓 | InvestmentStatement |
| net_worth_chart | 净值面积折线(可拖拽框选缩放) | BalanceSheet 净值序列 |
| balance_sheet | 资产/负债分组堆叠条 + 账户表 | BalanceSheet |

### 4.2 三个关键机制

1. **全量可定制**:用户保存的 `dashboard_section_order` 排序(拖拽/键盘)、逐卡隐藏/恢复、折叠、宽度(半/整列)与高度(compact/auto/tall)微调;2xl 双列 masonry;**隐藏的 widget 连查询都不执行**(`:164-165` 注释),不是 CSS 隐藏。
2. **每个 widget 独立月份 + 账户/分类过滤**,且状态经 `DASHBOARD_VIEW_PARAMS` 在卡片间互相携带——改 money_flow 的月份不会重置 spending_trend 的过滤。
3. **指标口径**:
   - 净值 = `balances` 日快照(区间 >5 年取月粒度、>1 年取周、否则日,`period.rb:168-176`),整条序列 Rails.cache 缓存;头部数字 = 最后快照,不是实时加总;
   - 现金流 = `IncomeStatement` PORO 原生 SQL 聚合,排除 pending/scheduled/excluded 与 `exclude_from_reports` 账户;**转进投资的金额可配置计为"投资"而非支出**(`analytics_excluded_kinds`);
   - 分类净额 = 同分类收支相抵再定方向(退款自动冲减)。

### 4.3 咱们的现状与差距

首页:PeriodControl(月/季/年/全部)→ SpendingOverview(支出+环比+预算剩余)→ 最新报告卡 → 资产汇总 → 分类构成 → 消费节奏(仅可比周期)→ 大额支出。结构健康,但**布局完全固定**、**模块不可关**、"全部时间"口径下两块整段消失。

---

## 五、图表体系

### 5.1 Sure(D3 v7 + d3-sankey,约 4500 行自绘 SVG,无第三方图表库)

| 类型 | 控制器 | 亮点 |
|---|---|---|
| 时间序列(面积) | `time_series_chart_controller.js`(739 行) | 拖拽框选缩放自定义区间;sparkline 复用(细线无交互) |
| 累计双线对比 | `spending_chart_controller.js` | 当月绿 vs 上月灰,共日月轴 |
| 分组柱状 | `bar_chart_controller.js` | 支出中性灰;x 轴标签全称→缩写→隔个显示三级降级;进行月 50% 透明 |
| 甜甜圈 | `donut_chart_controller.js` | 最小角 0.02rad、超支段置顶、hover 中心切换分类金额+占比、点击下钻交易列表;预算环/目标环复用 |
| Sankey | `sankey_chart_controller.js`(698 行) | 节点点击缩放、窄屏丢子类列;资金流=收入→分类→账户 |
| 贷款还款多序列 | `loan_payoff_chart_controller.js` | actual/scheduled/projected/extra 虚实线 + 本息占比阴影 |
| 目标投影 | `goal_projection_chart_controller.js` | 662 行,储蓄轨迹到达预测 |
| 服务端纯 SVG | `DS::Sparkline`/`DS::ProgressRing` | 零 JS 首屏 |

无 treemap、无日历热力图——**这两样咱们有且做得对**(中文记账"日历热力"是高频心智)。

### 5.2 咱们

Donut/TrendLine/CompareBar/CalendarHeat/**CategoryTreemap**/HBarList(react-native-svg 自绘几何 + gifted-charts)。类型覆盖已够,Sankey 缺位;交互(tooltip/下钻)已有基础。

---

## 六、交易与分类系统(Sure 的精华)

### 6.1 账户模型

- **多态 accountable 挂 9 种类型表**:depository / credit_card / investment / property / loan / crypto / vehicle / other_asset / other_liability;`classification`(asset/liability)是 **DB 生成列**;
- **余额按日快照物化**:`balances` 表存 start/inflows/outflows/adjustments,end_* 由 SQL 虚拟列算出;无交易的日子靠起止余额推算;`flows_factor ±1` 统一负债方向;
- 多币种:每条 entry 自带币种,`exchange_rates` 表按日;预算汇总时缺汇率的币种显式归入 `missing_cash_currencies` 而不是静默折算。

### 6.2 交易模型

- 通用 `entries` 表 + entryable 多态(Transaction/Valuation/Trade):一行同时承载"买了什么(交易)、值多少(估值)、换了什么(持仓变动)";
- **金额负=收入、正=支出**(方向内生于符号);pending 存 provider 的 extra JSON,不占列;
- `(account, source, external_id)` 唯一 + `idempotency_key` 唯一 → 同步天然幂等;
- 交易可带标签(多对多)、附件(≤10 个/10MB)、备注;潜在重复检测合并存 extra。

### 6.3 转账(与咱们差异最大的建模)

- **双腿建模**:`transfers` 表关联 inflow/outflow 两笔交易,验证异账户、金额相反、日期接近;
- **kind 由目的账户推导**:→ 贷款 = loan_payment(保留为预算支出现金流);→ 信用卡 = cc_payment(排除出预算);→ 投资/加密 = investment_contribution(默认计为预算支出,可降级);其余 = funds_movement(纯搬家);
- **自动配对**:4 天窗口 + 10% 汇率容差跨币种匹配,用户拒绝写入 `rejected_transfers` 不再提示;entries 上有专用部分索引加速匹配。

### 6.4 分类体系与三套自动分类

- 两级分类;**收支方向由金额符号决定,分类只管归属**(同分类可收可支,统计层做净值);子分类颜色强制继承父;Uncategorized 是合成哨兵不入库;21 个默认分类;
- **① 规则引擎**:`rules`(position 排序 + stop_processing)× `rule_conditions`(name/notes/merchant/amount/account/category/tag/type;name 支持 PG 正则,SafeRegex 拒绝反引用 + statement_timeout 5s 防 ReDoS)× 13 种动作(设分类/商户/标签/改名/拆分/触发 LLM/邮件……);**Quick Categorize 向导:选中一批已分组交易一键生成 name-like 规则**;`rule_runs` 全量审计;
- **② LLM 分类**:批量喂全分类树 + 交易摘要,置信度低于 family 阈值(默认 0.7)只扣留不应用;结果 `lock_attr!(:category_id)` 锁定;
- **③ 本地朴素贝叶斯**:词/商户/账户/金额(按币种分高斯)多因子,≥20 笔即训练,零成本兜底;
- **影子对比**(`categorization_comparisons`):按采样率让未启用的 provider 同跑一批,记录 agreed,`agreement_rate` 供切换决策——**AI 方案切换前先看数据**;
- `data_enrichments` 表记录"哪个 source 写过哪个字段",兼作 AI 结果缓存;`locked_attributes` 实现"自动来源只写一次、用户编辑优先"。

### 6.5 预算

- 家庭共享(user_id NULL)或个人预算;自然月 + **自定义月起始日(1-28)**;
- **类别余额结转(rollover)**:单向前向物化 + advisory lock 串行化重算;父分类分配、子分类可 ring-fence;Uncategorized 也有信封;
- 实际支出由 IncomeStatement 实时算(含退款冲减),不存冗余列。

---

## 七、AI 能力

- **Assistant = 约 40 个 function tools 的服务端 Agent**(读:交易/账户/持仓/损益/预算/规则;写:建改交易、建规则、改预算、匹配转账、设期初余额、导入账单、建目标),聊天与 **MCP 端点共用同一注册表**,权限在工具层统一裁决(预览门禁/访客裁剪);
- **Insights 夜间生成**(`GenerateInsightsJob`):9 类 typed 洞察——spending_anomaly / cash_flow_warning / net_worth_milestone / subscription_audit / savings_rate_change / idle_cash / budget_at_risk / budget_on_track / maintained_goal_depleted;正文是 **i18n 模板 + 预计算数字**(不存 LLM 自由文本,渲染安全);dedup_key 按月去重,"已确认"只覆盖看过的数字,新数字=新洞察;
- PDF 账单 AI 提取导入;LLM 分类影子评估(见上)。

---

## 八、移动端策略

Flutter companion:Home / **Assistant(AI 聊天)** / More / Settings 四 tab;离线优先(sqflite 缓存 + pending 队列同步)、生物锁、**隐私模式(money_masker 金额遮蔽)**、token 刷新 + MFA;定位"web 的伴随端"(不做银行管理/导入/规则)。**没有快速记账键盘、没有自然语言记账**——这俩恰是咱们的护城河。

---

## 九、逐项对比总表

| 能力 | Sure | 咱们 | 差距方向 |
|---|---|---|---|
| 录入速度 | 普通表单(依赖银行同步) | 两段式键盘 + 桌面快捷 + 一句话 AI | **咱们领先** |
| 银行聚合 | 33 provider + 定时同步 | 无(国内不可行/成本高) | 不可比,不追 |
| 分类方向语义 | 金额符号定方向,分类可净额(退款冲减) | type 固定 + 恒正金额 | **可借鉴** |
| 自动分类 | 规则 + LLM + 贝叶斯三引擎 + 影子评估 | suggestions 高斯频次建议 | **可借鉴** |
| 转账 | 双腿 + kind 语义 + 自动配对 | 单行双账户 | 单行更适合手动;**缺 kind 口径** |
| 预算 | 月 + 结转 + 个人/家庭 | 月/季/年 × 总/分类,信封式 | **咱们粒度多;缺结转** |
| 仪表盘 | 8 widget 全可定制,隐藏=不查询 | 固定 6 段 | **可借鉴** |
| 图表 | D3 自绘 9 类(含 Sankey) | 自绘 6 类(含 Treemap/日历热) | 大体平手,各有独占 |
| 环比口径 | 只比已流逝天数 + 方向感知着色 | 整期对比(需确认) | **可借鉴** |
| 洞察 | 9 类本地规则夜间生成 | LLM 周期报告(月/季/年) | **可借鉴:本地轻洞察** |
| 导入 | 5 步向导 + dry-run + revert + 去重更新 | 薄荷 + 通用映射 + fingerprint 去重 | **可借鉴;缺微信/支付宝** |
| 隐私 | privacy-sensitive + 移动端金额遮蔽 + 生物锁 | 无 | **低成本可补** |
| AI Agent | 40 工具 + MCP | 字段提取器(白名单防线) | **方向可借鉴** |
| 多端 | Web/桌面/移动/API/MCP | 单端(备份导出) | 定位不同,不追 |
| 报告可解释性 | insights 模板化数字 | zod 契约 + 脱敏聚合 + 版本化 | **咱们已对齐最佳实践** |

---

## 十、建议清单(按优先级)

### P0 —— 直接补强主线,性价比最高

1. **微信 / 支付宝账单 CSV 适配器**(对标 Sure 的 33 provider,国内等价物)
   - 落点:`src/features/import/adapters/`,复用 bohe-csv 的"固定格式解析 + 按账户投票主币种 + fingerprint 去重"骨架;
   - 微信/支付宝导出格式固定(XLSX/CSV、带交易单号),适配成本低于通用 CSV,收益远大:这是国内新用户迁移的最大入口。
2. **导入 dry-run 预览 + 批次可撤销**
   - 发布前汇总卡:"将导入 N 笔 / 跳过 M 笔重复 / 更新 K 笔";发布后按 importBatch 一键撤销(表已存在,补 UI 与删除链);
   - 依据:Sure 的 Publish=dry-run + revert + 去重"更新而非重复"(`import.rb`)。
3. **本地规则洞察(无 LLM 成本的 Insights)**
   - 新增 `src/features/insights/`:夜间/启动时本地计算——预算告急/超支(budget_at_risk)、当期最大单笔异常(对 183 天基线 z 分)、订阅/周期规则月度合计(subscription_audit:咱们 recurringRules 就是订阅清单)、储蓄率变化、闲置现金(资产模块有余额不动的账户);
   - 首页置顶卡片流,可"知道了"(acknowledge);借鉴 Sure 的 dedup_key + "新数字=新洞察"语义,正文模板化(不进 LLM)。
4. **环比口径对齐 + 趋势方向语义**
   - 当月 vs 上月只比已流逝天数,长月折尾;`fold_extra_days` 可直接抄思路;
   - 趋势着色收敛为一个带 `favorableDirection` 的工具函数(支出降=绿),替换各页自判断。

### P1 —— 体验升级

5. **预算月度结转(rollover)**:budgets 加 `rolloverEnabled` + 前向物化链(参考 `Budget::RolloverCalculator` 的单向前向 + 锁);中文记账"没用完滚下月"是高频诉求,咱们已有预算信封结构,加字段即可。
6. **仪表盘模块显隐 + 排序**:settings 存 `dashboardSectionOrder/hidden`(咱们已有 KV settings 表);RN 里长按上下移即可,不必做拖拽;**隐藏=不执行对应查询**(react-query 的 enabled 开关),对"全部时间"口径的性能也有帮助。
7. **轻量规则引擎**:条件(备注/商户关键词、金额区间、账户)→ 动作(设分类/账户/标签);**Quick Categorize**:交易列表多选 → "按此生成规则";与现有 suggestions 互补:规则=确定性,建议=统计性。
8. **NL 入口技能路由(一句话记账 → 一句话助手)**
   - 第一步先加**本地统计查询**:"这个月外卖花了多少"→ 意图分类(本地即可)→ SQL 聚合 → 文字回答,零 LLM 成本零延迟;
   - 第二步接 DeepSeek function calling,工具集:建交易(已有)/查统计/建预算/建周期规则——对标 Sure 的 40 工具但收敛到 5-6 个;
   - **记录建议与用户实选的 agreement**(咱们已有 suggestions 与 llmUsage 表,加一列命中率统计),对标影子对比。
9. **隐私模式 + 应用锁**:"我的"加隐私开关(金额渲染统一走 `<MoneyText>` 组件打码)与 expo-local-authentication 应用锁;对标 Sure 移动端 money_masker/local_auth,成本一天,感知度极高。
10. **首启引导**:检测零交易 → 首页顶部引导卡三选一(记第一笔 / 导入账单 / 看演示数据?);对标 Sure onboarding 的"不塞银行连接、只给下一步"。

### P2 —— 远期储备

11. **Sankey 资金流向图**(月度:收入→分类→结余/账户),react-native-svg 手写两层 sankey 可行;放 stats 页做"进阶"入口。
12. **转账 kind 语义**:transfer 增加 purpose(普通/信用卡还款/投资转入/还贷),统计与预算口径统一处理(还款不计支出、投资转入可配置);为将来"信用卡模式/投资追踪"铺路。
13. **每日资产余额快照表**:当前净值趋势从交易流推导,够用;若将来做资产估值增值(房价/基金净值),按 Sure 的 balances 快照表物化,历史任意时点净值 O(1)。
14. **退款/冲减建模**:负向金额或 refund 关联原交易,统计层分类净额化;Sure 的"分类净额"口径(退款自动冲减)更符合直觉。

### 不建议照搬

- **银行聚合/33 provider**:国内数据源合规与成本不可行,咱们的快速录入路线反而是正确差异化;
- **服务端架构/多端同步**:与本地优先定位冲突,备份+SAF 已够;
- **家庭共享/多用户权限**(account_shares、个人预算):单机定位,复杂度不匹配;
- **完全自由的双列 masonry 仪表盘**:移动端窄屏收益低,显隐+排序即可;
- **entries/entryable 多态双层交易表**:为估值/持仓/交易统一而生,咱们纯记账场景用不上,徒增复杂度。

---

## 十一、附:关键源码索引(Sure)

- 仪表盘 sections:`app/controllers/pages_controller.rb:166-261`、`app/views/pages/dashboard/*`
- 图表:`app/javascript/controllers/*_chart_controller.js`、`config/importmap.rb`(D3 pin)
- 洞察:`app/models/insight.rb` + `insight/generators/*`
- 规则:`app/models/rule.rb`、`rule/*`、`family/auto_categorizer.rb`、`family/bayes_categorizer.rb`
- 转账:`app/models/transfer.rb`、`family/auto_transfer_matchable.rb`
- 预算:`app/models/budget.rb`、`budget/rollover_calculator.rb`
- 导入:`app/models/import.rb`、`transaction_import.rb`、`app/views/import/**`
- 聚合:`app/models/income_statement.rb`(+ 12 个子模块)、`balance_sheet.rb`、`period.rb`、`trend.rb`
- 移动端:`mobile/lib/`(main_navigation_screen、sync_service、money_masker)
- 文档:`docs/onboarding/guide.md`、`docs/clients.md`、`docs/hosting/mcp.md`、`docs/llm-guides/*`
