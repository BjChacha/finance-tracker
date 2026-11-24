import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/db/client';
import { categories, transactions } from '@/db/schema';
import { UNCATEGORIZED_ID } from '@/features/transactions/filters';
import { STATS_GC_TIME, STATS_STALE_TIME } from './hooks';
import {
  buildCategoryTrend,
  trendMonths,
  type CategoryTrend,
  type TrendRow,
} from './category-trend-model';
import type { BreakdownType, StatsRange } from './repository';

export * from './category-trend-model';

const parentCat = alias(categories, 'parent_cat');

/**
 * Top N 分类的逐月趋势。
 *
 * 与 categoryBreakdown 同口径：子分类归并到一级分类，未分类兜底成一个分组，
 * 这样「趋势」与「构成」两块图读的是同一套数字。转账手续费不参与
 * （它是支出汇总的补充项，没有分类归属，混进来会让「其他」失真）。
 */
export async function categoryTrend(
  range: StatsRange,
  type: BreakdownType,
  limit = 4,
): Promise<CategoryTrend> {
  const groupId = sql<string>`COALESCE(${parentCat.id}, ${categories.id}, ${UNCATEGORIZED_ID})`;
  const groupName = sql<string>`COALESCE(${parentCat.name}, ${categories.name}, '未分类')`;
  const groupColor = sql<string>`COALESCE(${parentCat.color}, ${categories.color}, '#9CA3AF')`;
  const month = sql<string>`substr(${transactions.dateKey}, 1, 7)`;
  const total = sql<number>`SUM(${transactions.amountBaseCents})`.mapWith(Number);

  // 趋势窗口可能比所选周期更宽（见 trendMonths），查询范围随之放宽
  const months = trendMonths(range.start, range.end);

  const rows = await db
    .select({
      categoryId: groupId,
      name: groupName,
      color: groupColor,
      month,
      total,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCat, eq(categories.parentId, parentCat.id))
    .where(
      and(
        sql`${transactions.dateKey} >= ${`${months[0] ?? range.start.slice(0, 7)}-01`}`,
        sql`${transactions.dateKey} <= ${range.end}`,
        eq(transactions.type, type),
      ),
    )
    .groupBy(groupId, groupName, groupColor, month)
    .orderBy(desc(total));

  return buildCategoryTrend(rows as TrendRow[], months, { limit });
}

/** key: ['stats','category-trend', ...] */
export function useCategoryTrend(
  range: StatsRange,
  type: BreakdownType,
  limit = 4,
  enabled = true,
) {
  return useQuery({
    queryKey: ['stats', 'category-trend', { range, type, limit }],
    queryFn: () => categoryTrend(range, type, limit),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
    enabled,
  });
}
