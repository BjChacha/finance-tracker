import { toAnalysisInput } from "../llm-payload";
import type { ReportSnapshot } from "../snapshot";

function snapshot(): ReportSnapshot {
  return {
    period: "month",
    periodKey: "2026-10",
    periodLabel: "2026年10月",
    elapsedDays: 18,
    isPartial: true,
    totals: {
      expenseCents: 355_00,
      incomeCents: 500_00,
      netCents: 145_00,
      savingsRatePct: 29,
      expenseCount: 12,
      activeDays: 9,
      dailyAverageCents: 1972,
      largestExpenseCents: 200_00,
    },
    comparison: {
      expenseCents: 600_00,
      incomeCents: 400_00,
      expenseChangePct: -40.8,
      incomeChangePct: 25,
    },
    categories: [
      {
        id: "cat-food",
        name: "餐饮",
        color: "#F59E0B",
        icon: "utensils",
        totalCents: 35_000,
        pct: 98.6,
      },
    ],
    series: [{ label: "第1周", expenseCents: 30_500 }],
    weekdayPattern: {
      weekdayExpenseCents: 10_500,
      weekendExpenseCents: 25_000,
      weekdayPct: 29.6,
      weekendPct: 70.4,
    },
    amountBuckets: [{ label: "50-200元", count: 2, totalCents: 15_000 }],
    topExpenses: [{ category: "餐饮", amountCents: 20_000, weekIndex: 1 }],
  };
}

it("projects an explicit whitelist of aggregate fields", () => {
  const input = toAnalysisInput(snapshot());
  expect(Object.keys(input).sort()).toEqual([
    "amountBuckets",
    "categories",
    "comparison",
    "currency",
    "elapsedDays",
    "isPartial",
    "periodLabel",
    "periodType",
    "series",
    "topExpenses",
    "totals",
    "weekdayPattern",
  ]);
});

it("never sends notes, accounts, projects, ids or exact dates", () => {
  const serialized = JSON.stringify(toAnalysisInput(snapshot()));
  expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  // periodKey stays local: only the human label leaves the device.
  expect(serialized).not.toContain("2026-10");
  for (const forbidden of [
    '"note"',
    '"account"',
    '"accountId"',
    '"project"',
    '"projectId"',
    '"id"',
    '"dateKey"',
    '"date"',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
});

it("converts cents to yuan without changing the amount", () => {
  const input = toAnalysisInput(snapshot());
  expect(input.totals.expenseYuan).toBe(355);
  expect(input.totals.netYuan).toBe(145);
  expect(input.categories[0]?.amountYuan).toBe(350);
  expect(input.series[0]?.expenseYuan).toBe(305);
  expect(input.amountBuckets[0]?.totalYuan).toBe(150);
});
