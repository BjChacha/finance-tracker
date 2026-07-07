# 实施计划：本地记账 APP

## 里程碑与检查清单

### M1 项目脚手架 + 数据层
- [ ] `npx create-expo-app`（TS 模板）+ expo-router + strict tsconfig + ESLint/Prettier
- [ ] 安装依赖：expo-sqlite, drizzle-orm, drizzle-kit, @tanstack/react-query, zustand, dayjs, zod, expo-crypto, react-native-gifted-charts, react-native-svg, @shopify/flash-list, papaparse, expo-file-system, expo-sharing, expo-document-picker
- [ ] `src/db/schema.ts` 全部 8 表 + drizzle-kit 生成首个迁移 + `_layout.tsx` 迁移门
- [ ] `src/db/seed.ts`：中文预置分类（~20 支出 + 8 收入）+ 默认现金账户
- [ ] `src/lib/money.ts`（parseMoneyToCents/formatCents）、`src/lib/date.ts`（dateKey）+ jest-expo 单测
- 验证：`npx tsc --noEmit`、`npm test`、`npx expo start` 可打开 Tab 骨架

### M2 记账核心 CRUD
- [ ] transactions/accounts/categories 三个 feature 的 repository + hooks（queryKey 规范 + 集中失效）
- [ ] 记一笔 modal：支出|收入|转账三 tab、金额键盘、分类九宫格、账户选择、日期、备注
- [ ] 明细页：FlashList 按日分组、月切换、汇总条、筛选
- [ ] 交易详情/编辑/删除；账户管理（余额聚合/总资产）；分类管理
- 验证：转账余额正确且不计入收支；删除回滚正确

### M3 图表可视化
- [ ] stats repository（SQL 聚合下推）
- [ ] 图表页：分类占比环形（下钻）、收支趋势（日/周/月/年）、月度对比柱状、账户分布、净资产趋势、日历热力图（svg 自绘）、分类排行
- [ ] 时间范围选择器组件
- 验证：fixture 数据下图表与明细汇总一致

### M4 导入导出 + 迁移框架
- [ ] backup feature：JSON 全量导出/分享；恢复（zod + 升级链 + 双确认 + 安全备份）；CSV 导出（BOM）
- [ ] import/core：types.ts、registry.ts、pipeline.ts、dedupe.ts、encoding.ts（GBK）
- [ ] GenericCsvAdapter + 列映射向导 UI + import_mappings 记忆 + 批次撤销
- [ ] 写 10 行示例适配器验证可扩展性（验证后删除）
- 验证：备份→清空→恢复一致；GBK/UTF-8 导入成功；重复导入去重；撤销回滚

### M5 预算 + 周期记账
- [ ] budgets feature：CRUD + 进度条 + 阈值/超支通知（settings 记录已触发防重复）
- [ ] recurring feature：规则 CRUD + catchUp() 执行器（幂等、跨期、月末对齐）+ 待确认列表
- 验证：单测覆盖 next_run 推进；时间前调后补账正确

### M6 打磨 + 收尾
- [ ] 暗色模式走查、空态、错误边界
- [ ] 全量 `npx tsc --noEmit` + `npm test` + lint
- [ ] trellis-check、spec 更新、git 提交

## 验证命令

```bash
npx tsc --noEmit
npm test
npx expo start   # 手工回归
```

## 回滚点

每个里程碑结束 git commit 一次；出问题回退到上一里程碑提交。
