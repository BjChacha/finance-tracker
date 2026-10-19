import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

jest.mock("@/db/client", () => {
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
  const sqlite = new DatabaseSync(":memory:");
  const { drizzle } = require("drizzle-orm/sqlite-proxy");
  const db = drizzle(
    async (
      query: string,
      params: import("node:sqlite").SQLInputValue[],
      method: string,
    ) => {
      const statement = sqlite.prepare(query);
      statement.setReturnArrays(true);
      if (method === "run") {
        statement.run(...params);
        return { rows: [] };
      }
      return {
        rows:
          method === "get" ? statement.get(...params) : statement.all(...params),
      };
    },
  );
  return { db, sqlite };
});

import { buildReportSnapshot } from "../snapshot";

const sqlite = require("@/db/client")
  .sqlite as import("node:sqlite").DatabaseSync;

const TODAY = "2026-10-18";

function transaction(
  id: string,
  type: string,
  amount: number,
  category: string | null,
  options: {
    to?: string;
    fee?: number;
    date?: string;
    note?: string;
  } = {},
) {
  const dateKey = options.date ?? "2026-10-02";
  sqlite
    .prepare(
      `INSERT INTO transactions (id, type, amount, amount_base_cents, currency, exchange_rate,
    fee, account_id, to_account_id, to_amount, category_id, date, date_key, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      type,
      amount,
      amount,
      "CNY",
      1_000_000,
      options.fee ?? 0,
      "cash",
      options.to ?? null,
      options.to ? amount : null,
      category,
      100,
      dateKey,
      options.note ?? "",
      100,
      100,
    );
}

beforeAll(() => {
  const directory = join(process.cwd(), "src/db/migrations");
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(join(directory, file), "utf8"));
});

beforeEach(() => {
  sqlite.exec(
    "DELETE FROM transactions; DELETE FROM reports; DELETE FROM accounts; DELETE FROM categories;",
  );
  const insertAccount = sqlite.prepare(`INSERT INTO accounts
    (id, name, type, icon, color, initial_balance, currency, rate_to_base, include_in_total, archived, created_at, updated_at)
    VALUES (?, ?, 'cash', 'wallet', '#123456', 0, 'CNY', 1000000, 1, 0, 1, 1)`);
  insertAccount.run("cash", "Secret Account");
  insertAccount.run("savings", "Savings");
  sqlite.exec(`INSERT INTO categories (id, name, type, icon, color, parent_id, archived) VALUES
    ('food', 'Food', 'expense', 'utensils', '#123456', NULL, 0),
    ('coffee', 'Coffee', 'expense', 'coffee', '#123456', 'food', 0),
    ('salary', 'Salary', 'income', 'wallet', '#123456', NULL, 0)`);

  transaction("e1", "expense", 10_000, "food", {
    date: "2026-10-02",
    note: "SECRET-REMARK-42",
  });
  transaction("e2", "expense", 20_000, "food", { date: "2026-10-03" });
  transaction("e3", "expense", 5_000, "coffee", { date: "2026-10-10" });
  transaction("t1", "transfer", 100_000, null, {
    to: "savings",
    fee: 500,
    date: "2026-10-06",
  });
  transaction("i1", "income", 500_000, "salary", { date: "2026-10-05" });
  transaction("prev1", "expense", 60_000, "food", { date: "2026-09-05" });
  transaction("prev2", "income", 400_000, "salary", { date: "2026-09-06" });
  transaction("future", "expense", 999_900, "food", { date: "2026-11-01" });
});

afterAll(() => sqlite.close());

describe("buildReportSnapshot", () => {
  it("aggregates the period, treats transfer fees as expense and compares the same elapsed span", async () => {
    const snapshot = await buildReportSnapshot(
      { period: "month", key: "2026-10" },
      TODAY,
    );
    expect(snapshot.periodLabel).toBe("2026年10月");
    expect(snapshot.isPartial).toBe(true);
    expect(snapshot.elapsedDays).toBe(18);
    expect(snapshot.totals).toEqual({
      expenseCents: 35_500,
      incomeCents: 500_000,
      netCents: 464_500,
      savingsRatePct: 92.9,
      expenseCount: 3,
      activeDays: 4,
      dailyAverageCents: 1_972,
      largestExpenseCents: 20_000,
    });
    expect(snapshot.comparison).toEqual({
      expenseCents: 60_000,
      incomeCents: 400_000,
      expenseChangePct: -40.8,
      incomeChangePct: 25,
    });
  });

  it("rolls child categories into their parent and appends transfer fees", async () => {
    const snapshot = await buildReportSnapshot(
      { period: "month", key: "2026-10" },
      TODAY,
    );
    expect(snapshot.categories).toEqual([
      {
        id: "food",
        name: "Food",
        color: "#123456",
        icon: "utensils",
        totalCents: 35_000,
        pct: 98.6,
      },
      {
        id: "__transfer_fees__",
        name: "转账手续费",
        color: "#64748B",
        icon: "credit-card",
        totalCents: 500,
        pct: 1.4,
      },
    ]);
  });

  it("buckets weeks within the elapsed span and splits weekday from weekend", async () => {
    const snapshot = await buildReportSnapshot(
      { period: "month", key: "2026-10" },
      TODAY,
    );
    expect(snapshot.series).toEqual([
      { label: "第1周", expenseCents: 30_500 },
      { label: "第2周", expenseCents: 5_000 },
      { label: "第3周", expenseCents: 0 },
    ]);
    expect(snapshot.weekdayPattern).toEqual({
      weekdayExpenseCents: 10_500,
      weekendExpenseCents: 25_000,
      weekdayPct: 29.6,
      weekendPct: 70.4,
    });
  });

  it("keeps the amount distribution on expense records only", async () => {
    const snapshot = await buildReportSnapshot(
      { period: "month", key: "2026-10" },
      TODAY,
    );
    expect(snapshot.amountBuckets).toEqual([
      { label: "<50元", count: 0, totalCents: 0 },
      { label: "50-200元", count: 2, totalCents: 15_000 },
      { label: "200-1000元", count: 1, totalCents: 20_000 },
      { label: "≥1000元", count: 0, totalCents: 0 },
    ]);
    expect(snapshot.topExpenses).toEqual([
      { category: "Food", amountCents: 20_000, weekIndex: 1 },
      { category: "Food", amountCents: 10_000, weekIndex: 1 },
      { category: "Food", amountCents: 5_000, weekIndex: 2 },
    ]);
  });

  it("redacts notes, account names and exact dates by construction", async () => {
    const snapshot = await buildReportSnapshot(
      { period: "month", key: "2026-10" },
      TODAY,
    );
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("SECRET-REMARK-42");
    expect(serialized).not.toContain("Secret Account");
    expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("uses calendar months for a year and keeps a partial year flagged", async () => {
    const snapshot = await buildReportSnapshot(
      { period: "year", key: "2026" },
      TODAY,
    );
    expect(snapshot.series).toHaveLength(12);
    expect(snapshot.series[8]).toEqual({
      label: "9月",
      expenseCents: 60_000,
    });
    expect(snapshot.series[9]).toEqual({
      label: "10月",
      expenseCents: 35_500,
    });
    expect(snapshot.isPartial).toBe(true);
    expect(snapshot.totals.expenseCents).toBe(95_500);
  });

  it("returns null changes when the previous period has no records", async () => {
    const snapshot = await buildReportSnapshot(
      { period: "month", key: "2026-09" },
      TODAY,
    );
    expect(snapshot.comparison.expenseChangePct).toBeNull();
    expect(snapshot.comparison.incomeChangePct).toBeNull();
  });

  it("reports an empty period without inventing values", async () => {
    const snapshot = await buildReportSnapshot(
      { period: "month", key: "2026-07" },
      TODAY,
    );
    expect(snapshot.totals).toEqual({
      expenseCents: 0,
      incomeCents: 0,
      netCents: 0,
      savingsRatePct: null,
      expenseCount: 0,
      activeDays: 0,
      dailyAverageCents: 0,
      largestExpenseCents: 0,
    });
    expect(snapshot.categories).toEqual([]);
    expect(snapshot.topExpenses).toEqual([]);
  });
});
