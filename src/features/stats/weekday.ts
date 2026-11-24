import { and, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { transactions } from '@/db/schema';
import { expenseAmount, incomeAmount } from '@/features/transactions/filters';
import { todayKey } from '@/lib/date';
import { buildWeekdayStats, datesInRange, type WeekdayStat } from './weekday-model';
import type { BreakdownType, StatsRange } from './repository';

export * from './weekday-model';

/**
 * 工作日分布：把区间内的金额按「星期几」聚合。
 *
 * 存在的意义是回答「我周末是不是花太多」——这个维度此前只被消费报告
 * 算过一次喂给模型（reports/snapshot.ts 的 weekdayPattern），界面上从未出现过。
 */
export async function weekdayTotals(
  range: StatsRange,
  type: BreakdownType,
): Promise<WeekdayStat[]> {
  const today = todayKey();
  // 未来日期不计入：否则「本月还没到的那几天」会作为零支出天数拉低日均
  const end = range.end < today ? range.end : today;
  const start = range.start <= end ? range.start : end;

  const rows = await db
    .select({
      dateKey: transactions.dateKey,
      expense: sql<number>`COALESCE(SUM(${expenseAmount()}), 0)`.mapWith(Number),
      income: sql<number>`COALESCE(SUM(${incomeAmount()}), 0)`.mapWith(Number),
      count: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        sql`${transactions.dateKey} >= ${start}`,
        sql`${transactions.dateKey} <= ${end}`,
      ),
    )
    .groupBy(transactions.dateKey);

  const key = type === 'expense' ? 'expense' : 'income';
  return buildWeekdayStats(
    rows.map((row) => ({
      dateKey: row.dateKey,
      total: row[key],
      count: row.count,
    })),
    datesInRange(start, end),
  );
}
