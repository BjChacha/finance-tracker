import { ParseError, type ChatCompletionRequest } from "@/features/llm/chat";
import { createReportAnalyzer } from "../analyzer";
import type { ReportAnalysisInput } from "../llm-payload";

const input: ReportAnalysisInput = {
  periodType: "month",
  periodLabel: "2026年10月",
  elapsedDays: 18,
  isPartial: true,
  currency: "CNY",
  totals: {
    expenseYuan: 355,
    incomeYuan: 500,
    netYuan: 145,
    savingsRatePct: 29,
    expenseCount: 12,
    activeDays: 9,
    dailyAverageYuan: 19.72,
    largestExpenseYuan: 200,
  },
  comparison: {
    previousExpenseYuan: 600,
    previousIncomeYuan: 400,
    expenseChangePct: -40.8,
    incomeChangePct: 25,
  },
  categories: [{ name: "餐饮", amountYuan: 350, sharePct: 98.6 }],
  series: [{ label: "第1周", expenseYuan: 305 }],
  weekdayPattern: {
    weekdayExpenseYuan: 105,
    weekendExpenseYuan: 250,
    weekdayPct: 29.6,
    weekendPct: 70.4,
  },
  amountBuckets: [{ label: "50-200元", count: 2, totalYuan: 150 }],
  topExpenses: [{ category: "餐饮", amountYuan: 200, weekIndex: 1 }],
};

const analysis = {
  headline: "餐饮撑起了这个月",
  mood: {
    label: "松弛",
    score: 4,
    narrative: "餐饮占九成，但周末没有失控",
  },
  values: [
    { id: "self_care", label: "吃得开心", narrative: "餐饮占支出九成" },
  ],
  dataPoints: [
    { label: "餐饮占比", value: "90%", note: "几乎全部支出" },
    { label: "笔数", value: "12 笔", note: "平均每笔 29 元" },
  ],
  categoryStories: [
    { category: "餐饮", emotion: "日常慰藉", note: "工作日的稳定支出" },
  ],
  suggestions: [
    {
      title: "午餐自带",
      action: "每周两次自带午餐",
      target: "本月外卖≤8次",
      impact: "预计每月省下180元",
    },
  ],
  savingPotentialYuan: 180,
};

function completion(content: string, finishReason = "stop") {
  return { choices: [{ message: { content }, finish_reason: finishReason }] };
}

it("sends the system prompt plus the redacted payload and decodes the answer", async () => {
  const transport = jest.fn(
    async (_body: ChatCompletionRequest, _signal?: AbortSignal) =>
      completion(JSON.stringify(analysis)),
  );
  const analyze = createReportAnalyzer(transport, "deepseek-flash");
  await expect(analyze(input)).resolves.toEqual(analysis);
  const body = transport.mock.calls[0]?.[0];
  expect(body?.model).toBe("deepseek-flash");
  expect(body?.response_format).toEqual({ type: "json_object" });
  expect(body?.thinking).toEqual({ type: "disabled" });
  expect(body?.max_tokens).toBeGreaterThanOrEqual(1024);
  expect(body?.messages[0]?.content).toContain("脱敏");
  expect(JSON.parse(body?.messages[1]?.content ?? "null")).toEqual(input);
});

it("propagates a transport failure unchanged", async () => {
  const transport = jest.fn(async () => {
    throw new ParseError("timeout", "timed out");
  });
  const analyze = createReportAnalyzer(transport, "deepseek-flash");
  await expect(analyze(input)).rejects.toMatchObject({ failure: "timeout" });
});

it("rejects a truncated completion", async () => {
  const transport = jest.fn(async () =>
    completion(JSON.stringify(analysis), "length"),
  );
  const analyze = createReportAnalyzer(transport, "deepseek-flash");
  await expect(analyze(input)).rejects.toBeInstanceOf(ParseError);
});

it("rejects a completion that does not satisfy the contract", async () => {
  const transport = jest.fn(async () => completion('{"spendingStyle":"x"}'));
  const analyze = createReportAnalyzer(transport, "deepseek-flash");
  await expect(analyze(input)).rejects.toMatchObject({
    failure: "invalid_response",
  });
});
