import { and, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/db/client';
import { accounts, categories, transactions } from '@/db/schema';
import { UNCATEGORIZED_ID } from '@/features/transactions/filters';
import { STATS_GC_TIME, STATS_STALE_TIME } from './hooks';
import { aggregateMoneyFlow, type FlowRow, type MoneyFlow } from './sankey-model';
import type { BreakdownType, StatsRange } from './repository';

export * from './sankey-model';

const parentCat = alias(categories, 'parent_cat');

/**
 * 某周期内「账户 → 分类」的资金流向。
 *
 * 分类按一级归并（与构成/趋势同口径）；未指定分类的支出落到「未分类」。
 * 「其他」节点由 aggregateMoneyFlow 折叠产生，这里给全量明细。
 */
export async function moneyFlow(
  range: StatsRange,
  type: BreakdownType,
): Promise<MoneyFlow> {
  const groupId = sql<string>`COALESCE(${parentCat.id}, ${categories.id}, ${UNCATEGORIZED_ID})`;
  const groupName = sql<string>`COALESCE(${parentCat.name}, ${categories.name}, '未分类')`;
  const groupColor = sql<string>`COALESCE(${parentCat.color}, ${categories.color}, '#9CA3AF')`;

  const rows = await db
    .select({
      accountId: transactions.accountId,
      accountName: accounts.name,
      accountColor: accounts.color,
      categoryId: groupId,
      categoryName: groupName,
      categoryColor: groupColor,
      total: sql<number>`SUM(${transactions.amountBaseCents})`.mapWith(Number),
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCat, eq(categories.parentId, parentCat.id))
    .where(
      and(
        sql`${transactions.dateKey} >= ${range.start}`,
        sql`${transactions.dateKey} <= ${range.end}`,
        eq(transactions.type, type),
      ),
    )
    .groupBy(
      transactions.accountId,
      accounts.name,
      accounts.color,
      groupId,
      groupName,
      groupColor,
    );

  return aggregateMoneyFlow(rows as FlowRow[]);
}

/** key: ['stats','money-flow', ...] */
export function useMoneyFlow(
  range: StatsRange,
  type: BreakdownType,
  enabled = true,
) {
  return useQuery({
    queryKey: ['stats', 'money-flow', { range, type }],
    queryFn: () => moneyFlow(range, type),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
    enabled,
  });
}
