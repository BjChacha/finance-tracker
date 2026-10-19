import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { db } from "@/db/client";
import { categories, transactions } from "@/db/schema";
import { categoryBreakdown } from "@/features/stats/repository";
import { expenseAmount, incomeAmount } from "@/features/transactions/filters";
import { resolvePeriod, type PeriodSelection } from "@/lib/analytics-range";
import {
  dayjs,
  formatPeriodTitle,
  periodRange,
  todayKey,
  type BudgetPeriod,
} from "@/lib/date";
import { reportsText } from "./labels";

/** Reports share the budget period vocabulary: calendar month, quarter and year. */
export type ReportPeriod = BudgetPeriod;

const CATEGORY_LIMIT = 8;
const TOP_EXPENSE_LIMIT = 8;

const centsSchema = z.number().int().nonnegative();
const shareSchema = z.number().min(0).max(100);

/**
 * Persisted snapshot contract. Every field here is safe to show locally and, after the explicit
 * whitelist in `llm-payload`, to send to the model: no notes, account names, projects or
 * transaction dates are representable.
 */
export const reportSnapshotSchema = z.object({
  period: z.enum(["month", "quarter", "year"]),
  periodKey: z.string().min(1),
  periodLabel: z.string().min(1),
  elapsedDays: z.number().int().positive(),
  isPartial: z.boolean(),
  totals: z.object({
    expenseCents: centsSchema,
    incomeCents: centsSchema,
    netCents: z.number().int(),
    savingsRatePct: z.number().nullable(),
    expenseCount: centsSchema,
    activeDays: centsSchema,
    dailyAverageCents: centsSchema,
    largestExpenseCents: centsSchema,
  }),
  comparison: z.object({
    expenseCents: centsSchema,
    incomeCents: centsSchema,
    expenseChangePct: z.number().nullable(),
    incomeChangePct: z.number().nullable(),
  }),
  categories: z.array(
    z.object({ name: z.string().min(1), totalCents: centsSchema, pct: shareSchema }),
  ),
  series: z.array(
    z.object({ label: z.string().min(1), expenseCents: centsSchema }),
  ),
  weekdayPattern: z.object({
    weekdayExpenseCents: centsSchema,
    weekendExpenseCents: centsSchema,
    weekdayPct: shareSchema,
    weekendPct: shareSchema,
  }),
  amountBuckets: z.array(
    z.object({ label: z.string().min(1), count: centsSchema, totalCents: centsSchema }),
  ),
  topExpenses: z.array(
    z.object({
      category: z.string().min(1),
      amountCents: centsSchema,
      weekIndex: z.number().int().positive(),
    }),
  ),
});

export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;
export type ReportTotals = ReportSnapshot["totals"];
export type ReportSeriesPoint = ReportSnapshot["series"][number];

function sharePct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function changePct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function inRange(range: { start: string; end: string }) {
  return and(
    sql`${transactions.dateKey} >= ${range.start}`,
    sql`${transactions.dateKey} <= ${range.end}`,
  );
}

const AMOUNT_BUCKET_INDEX = sql<number>`CASE
  WHEN ${transactions.amountBaseCents} < 5000 THEN 0
  WHEN ${transactions.amountBaseCents} < 20000 THEN 1
  WHEN ${transactions.amountBaseCents} < 100000 THEN 2
  ELSE 3 END`;

const AMOUNT_BUCKET_LABELS = [
  reportsText.amountBucketSmall,
  reportsText.amountBucketMedium,
  reportsText.amountBucketLarge,
  reportsText.amountBucketHuge,
];

const parentCategory = alias(categories, "report_parent_category");

type DailyExpense = { dateKey: string; expenseCents: number };

/**
 * Weekly buckets for month/quarter and calendar months for a year. Labels are period-relative,
 * so no transaction date ever leaves the device.
 */
function buildSeries(
  daily: DailyExpense[],
  period: ReportPeriod,
  start: string,
  elapsedDays: number,
): ReportSeriesPoint[] {
  if (period === "year") {
    const months = Array.from({ length: 12 }, (_, index) => ({
      label: `${index + 1}月`,
      expenseCents: 0,
    }));
    for (const row of daily) {
      const bucket = months[Number(row.dateKey.slice(5, 7)) - 1];
      if (bucket) bucket.expenseCents += row.expenseCents;
    }
    return months;
  }
  const weekCount = Math.max(1, Math.ceil(elapsedDays / 7));
  const weeks = Array.from({ length: weekCount }, (_, index) => ({
    label: `第${index + 1}周`,
    expenseCents: 0,
  }));
  for (const row of daily) {
    const offset = dayjs(row.dateKey).diff(dayjs(start), "day");
    const index = Math.min(Math.max(Math.floor(offset / 7), 0), weekCount - 1);
    const week = weeks[index];
    if (week) week.expenseCents += row.expenseCents;
  }
  return weeks;
}

/**
 * Builds the redacted aggregate for one period. The previous period is compared over the same
 * elapsed span (see `resolvePeriod`), so a partial current month is never compared to a full one.
 */
export async function buildReportSnapshot(
  selection: PeriodSelection,
  today: string = todayKey(),
): Promise<ReportSnapshot> {
  const { range, comparison, elapsedDays } = resolvePeriod(selection, today);
  const [, fullEnd] = periodRange(selection.period, selection.key);

  const [current] = await db
    .select({
      expenseCents: sql<number>`COALESCE(SUM(${expenseAmount()}), 0)`.mapWith(Number),
      incomeCents: sql<number>`COALESCE(SUM(${incomeAmount()}), 0)`.mapWith(Number),
      expenseCount: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN 1 ELSE 0 END), 0)`.mapWith(
        Number,
      ),
      activeDays: sql<number>`COUNT(DISTINCT CASE WHEN ${expenseAmount()} > 0 THEN ${transactions.dateKey} END)`.mapWith(
        Number,
      ),
      largestExpenseCents: sql<number>`COALESCE(MAX(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amountBaseCents} ELSE 0 END), 0)`.mapWith(
        Number,
      ),
    })
    .from(transactions)
    .where(inRange(range));

  const [previous] = await db
    .select({
      expenseCents: sql<number>`COALESCE(SUM(${expenseAmount()}), 0)`.mapWith(Number),
      incomeCents: sql<number>`COALESCE(SUM(${incomeAmount()}), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(inRange(comparison));

  const daily = await db
    .select({
      dateKey: transactions.dateKey,
      expenseCents: sql<number>`COALESCE(SUM(${expenseAmount()}), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(inRange(range))
    .groupBy(transactions.dateKey)
    .orderBy(asc(transactions.dateKey));

  const slices = await categoryBreakdown(range, "expense");
  const topSlices = slices.slice(0, CATEGORY_LIMIT);
  const remainingSlices = slices.slice(CATEGORY_LIMIT);
  const categoryTotal = slices.reduce((sum, row) => sum + row.total, 0);
  const categoryShares = topSlices.map((row) => ({
    name: row.name,
    totalCents: row.total,
    pct: sharePct(row.total, categoryTotal),
  }));
  if (remainingSlices.length > 0) {
    const restTotal = remainingSlices.reduce((sum, row) => sum + row.total, 0);
    categoryShares.push({
      name: reportsText.otherCategories(remainingSlices.length),
      totalCents: restTotal,
      pct: sharePct(restTotal, categoryTotal),
    });
  }

  const bucketRows = await db
    .select({
      bucket: AMOUNT_BUCKET_INDEX,
      count: sql<number>`COUNT(*)`.mapWith(Number),
      totalCents: sql<number>`COALESCE(SUM(${transactions.amountBaseCents}), 0)`.mapWith(
        Number,
      ),
    })
    .from(transactions)
    .where(and(inRange(range), eq(transactions.type, "expense")))
    .groupBy(AMOUNT_BUCKET_INDEX);
  const amountBuckets = AMOUNT_BUCKET_LABELS.map((label, index) => {
    const row = bucketRows.find((entry) => Number(entry.bucket) === index);
    return { label, count: row?.count ?? 0, totalCents: row?.totalCents ?? 0 };
  });

  const topRows = await db
    .select({
      category: sql<string>`COALESCE(${parentCategory.name}, ${categories.name}, ${reportsText.uncategorized})`,
      amountCents: transactions.amountBaseCents,
      dateKey: transactions.dateKey,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCategory, eq(categories.parentId, parentCategory.id))
    .where(and(inRange(range), eq(transactions.type, "expense")))
    .orderBy(desc(transactions.amountBaseCents))
    .limit(TOP_EXPENSE_LIMIT);

  let weekdayExpenseCents = 0;
  let weekendExpenseCents = 0;
  for (const row of daily) {
    const day = dayjs(row.dateKey).day();
    if (day === 0 || day === 6) weekendExpenseCents += row.expenseCents;
    else weekdayExpenseCents += row.expenseCents;
  }
  const observedTotal = weekdayExpenseCents + weekendExpenseCents;

  const expenseCents = current?.expenseCents ?? 0;
  const incomeCents = current?.incomeCents ?? 0;

  return reportSnapshotSchema.parse({
    period: selection.period,
    periodKey: selection.key,
    periodLabel: formatPeriodTitle(selection.period, selection.key),
    elapsedDays,
    isPartial: fullEnd > today,
    totals: {
      expenseCents,
      incomeCents,
      netCents: incomeCents - expenseCents,
      savingsRatePct:
        incomeCents > 0
          ? Math.round(((incomeCents - expenseCents) / incomeCents) * 1000) / 10
          : null,
      expenseCount: current?.expenseCount ?? 0,
      activeDays: current?.activeDays ?? 0,
      dailyAverageCents: Math.round(expenseCents / elapsedDays),
      largestExpenseCents: current?.largestExpenseCents ?? 0,
    },
    comparison: {
      expenseCents: previous?.expenseCents ?? 0,
      incomeCents: previous?.incomeCents ?? 0,
      expenseChangePct: changePct(expenseCents, previous?.expenseCents ?? 0),
      incomeChangePct: changePct(incomeCents, previous?.incomeCents ?? 0),
    },
    categories: categoryShares,
    series: buildSeries(daily, selection.period, range.start, elapsedDays),
    weekdayPattern: {
      weekdayExpenseCents,
      weekendExpenseCents,
      weekdayPct: sharePct(weekdayExpenseCents, observedTotal),
      weekendPct: sharePct(weekendExpenseCents, observedTotal),
    },
    amountBuckets,
    topExpenses: topRows.map((row) => ({
      category: row.category,
      amountCents: row.amountCents,
      weekIndex: Math.floor(dayjs(row.dateKey).diff(dayjs(range.start), "day") / 7) + 1,
    })),
  });
}
