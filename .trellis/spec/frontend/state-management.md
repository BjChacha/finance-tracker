# State Management

> 本项目状态管理：@tanstack/react-query（SQLite 读缓存）+ zustand（轻量 UI 态）。SQLite 视作"本地服务端"。

---

## 分层与依赖方向

```
UI (app/ 路由薄壳 + src/features/*/components)
  → hooks (src/features/*/hooks.ts, react-query)
  → repository (src/features/*/repository.ts, drizzle)
  → src/db/client.ts
```

- UI 不直接 import `src/db/*`（例外：`app/_layout.tsx` 迁移门；`import type` 取 schema 类型允许）。
- 跨 feature 只允许 import 对方 `index.ts` 公共出口。

## queryKey 规范

- `['transactions', filters]`、`['transaction', id]`、`['transactions-summary', monthKey]`
- `['accounts']`、`['account-balances']`、`['categories', type]`
- `['stats', <sub>, params]`、`['budgets']`、`['budget-status', monthKey]`

**写操作后禁止手工逐个失效**：所有 mutation 的 onSuccess 统一调 `src/features/transactions/invalidate.ts` 的集中失效函数（覆盖 transactions/account-balances/stats/budgets 前缀）。新增会影响统计的写路径时，先检查该文件是否已覆盖对应前缀。

## zustand 使用边界

只放 UI 态（筛选条件、表单草稿、设置项），业务数据一律走 react-query + repository，不复制进 store。

---
