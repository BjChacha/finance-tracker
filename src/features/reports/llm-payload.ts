import type { ReportSnapshot } from "./snapshot";

/**
 * The exact outbound shape. Fields are listed explicitly rather than spread from the snapshot, so
 * adding a field to the local snapshot can never leak it to the model by accident.
 */
export type ReportAnalysisInput = {
  periodType: "month" | "quarter" | "year";
  periodLabel: string;
  elapsedDays: number;
  isPartial: boolean;
  currency: "CNY";
  totals: {
    expenseYuan: number;
    incomeYuan: number;
    netYuan: number;
    savingsRatePct: number | null;
    expenseCount: number;
    activeDays: number;
    dailyAverageYuan: number;
    largestExpenseYuan: number;
  };
  comparison: {
    previousExpenseYuan: number;
    previousIncomeYuan: number;
    expenseChangePct: number | null;
    incomeChangePct: number | null;
  };
  categories: { name: string; amountYuan: number; sharePct: number }[];
  series: { label: string; expenseYuan: number }[];
  weekdayPattern: {
    weekdayExpenseYuan: number;
    weekendExpenseYuan: number;
    weekdayPct: number;
    weekendPct: number;
  };
  amountBuckets: { label: string; count: number; totalYuan: number }[];
  topExpenses: { category: string; amountYuan: number; weekIndex: number }[];
};

/** Cents stay exact in storage; the model reads yuan, rounded to fen. */
function yuan(cents: number): number {
  return Math.round(cents) / 100;
}

export function toAnalysisInput(snapshot: ReportSnapshot): ReportAnalysisInput {
  return {
    periodType: snapshot.period,
    periodLabel: snapshot.periodLabel,
    elapsedDays: snapshot.elapsedDays,
    isPartial: snapshot.isPartial,
    currency: "CNY",
    totals: {
      expenseYuan: yuan(snapshot.totals.expenseCents),
      incomeYuan: yuan(snapshot.totals.incomeCents),
      netYuan: yuan(snapshot.totals.netCents),
      savingsRatePct: snapshot.totals.savingsRatePct,
      expenseCount: snapshot.totals.expenseCount,
      activeDays: snapshot.totals.activeDays,
      dailyAverageYuan: yuan(snapshot.totals.dailyAverageCents),
      largestExpenseYuan: yuan(snapshot.totals.largestExpenseCents),
    },
    comparison: {
      previousExpenseYuan: yuan(snapshot.comparison.expenseCents),
      previousIncomeYuan: yuan(snapshot.comparison.incomeCents),
      expenseChangePct: snapshot.comparison.expenseChangePct,
      incomeChangePct: snapshot.comparison.incomeChangePct,
    },
    categories: snapshot.categories.map((row) => ({
      name: row.name,
      amountYuan: yuan(row.totalCents),
      sharePct: row.pct,
    })),
    series: snapshot.series.map((row) => ({
      label: row.label,
      expenseYuan: yuan(row.expenseCents),
    })),
    weekdayPattern: {
      weekdayExpenseYuan: yuan(snapshot.weekdayPattern.weekdayExpenseCents),
      weekendExpenseYuan: yuan(snapshot.weekdayPattern.weekendExpenseCents),
      weekdayPct: snapshot.weekdayPattern.weekdayPct,
      weekendPct: snapshot.weekdayPattern.weekendPct,
    },
    amountBuckets: snapshot.amountBuckets.map((row) => ({
      label: row.label,
      count: row.count,
      totalYuan: yuan(row.totalCents),
    })),
    topExpenses: snapshot.topExpenses.map((row) => ({
      category: row.category,
      amountYuan: yuan(row.amountCents),
      weekIndex: row.weekIndex,
    })),
  };
}
