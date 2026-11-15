import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";

jest.mock("@/db/client", () => ({
  db: { select: jest.fn(), insert: jest.fn() },
}));
jest.mock("@/lib/id", () => ({ newId: () => "usage-1" }));

import { db } from "@/db/client";
import { llmUsage } from "@/db/schema";
import { SMART_TAG } from "@/features/transactions/tags";
import { recordLLMUsage, smartRecognitionSummary } from "../repository";

const mockSelect = db.select as jest.Mock;
const dialect = new SQLiteSyncDialect();

const usageRow = {
  totalCalls: 12,
  totalCost: 4_500_000,
  totalPrompt: 900_000,
  totalCompletion: 100_000,
  monthCalls: 3,
  monthCost: 1_200_000,
  monthPrompt: 200_000,
  monthCompletion: 20_000,
};

/** 第一次 select 是 llm_usage 汇总（带 where），第二次是交易表统计（await from 本身） */
function setupSelects(
  usage: unknown[] = [usageRow],
  stats: unknown[] = [{ generated: 5, transactions: 20 }],
) {
  const where = jest.fn().mockResolvedValue(usage);
  mockSelect
    .mockReturnValueOnce({ from: () => ({ where }) })
    .mockReturnValueOnce({ from: () => Promise.resolve(stats) });
  return where;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("smartRecognitionSummary", () => {
  it("只统计识别调用（source=nl），报告生成的花费不计入", async () => {
    const where = setupSelects();

    const summary = await smartRecognitionSummary(new Date(2026, 10, 15));

    const compiled = dialect.sqlToQuery(where.mock.calls[0]![0]);
    expect(compiled.sql).toContain('"llm_usage"."source"');
    expect(compiled.params).toContain("nl");
    expect(compiled.params).not.toContain("report");
    // 本月边界（设备时区月初）在 select 的 CASE 表达式里，不在 where 上
    const monthExpr = dialect.sqlToQuery(mockSelect.mock.calls[0]![0]!.monthCost);
    expect(monthExpr.params).toContain(new Date(2026, 10, 1).getTime());
    expect(summary.month).toEqual({
      calls: 3,
      costMicros: 1_200_000,
      promptTokens: 200_000,
      completionTokens: 20_000,
    });
    expect(summary.total.calls).toBe(12);
  });

  it("智能生成笔数按交易标签精确匹配，并带回全部交易数作占比分母", async () => {
    setupSelects([usageRow], [{ generated: 5, transactions: 20 }]);

    const summary = await smartRecognitionSummary();

    const generatedExpr = mockSelect.mock.calls[1]![0]!.generated;
    const compiled = dialect.sqlToQuery(generatedExpr);
    expect(compiled.sql).toContain('"transactions"."tags"');
    expect(compiled.params).toContain(`%"${SMART_TAG}"%`);
    expect(summary.generated).toBe(5);
    expect(summary.transactions).toBe(20);
  });

  it("查不到行时全部按 0 处理，界面不会显示 undefined", async () => {
    setupSelects([], []);

    const summary = await smartRecognitionSummary();

    expect(summary.generated).toBe(0);
    expect(summary.transactions).toBe(0);
    expect(summary.total).toEqual({
      calls: 0,
      costMicros: 0,
      promptTokens: 0,
      completionTokens: 0,
    });
  });
});

describe("recordLLMUsage", () => {
  it("落库时带上用途，识别与报告分开计费", async () => {
    const values = jest.fn().mockResolvedValue(undefined);
    (db.insert as jest.Mock).mockReturnValue({ values });
    const usage = {
      promptTokens: 10,
      cacheHitTokens: 5,
      cacheMissTokens: 5,
      completionTokens: 20,
    };

    await recordLLMUsage("report", "deepseek-flash", usage, new Date(2026, 10, 15));

    expect(db.insert).toHaveBeenCalledWith(llmUsage);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ source: "report", promptTokens: 10, completionTokens: 20 }),
    );
  });
});
