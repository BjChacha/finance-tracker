import { ParseError } from "@/features/llm/chat";
import { decodeReportAnalysis } from "../analysis-contract";

const valid = {
  spendingStyle: "  餐饮为主的稳定型消费  ",
  styleTags: ["餐饮主导", "周末偏高", "小额高频"],
  insights: [
    { title: " 餐饮集中 ", detail: " 餐饮占支出八成以上 " },
    { title: "周末偏高", detail: "周末支出是工作日的两倍" },
    { title: "小额高频", detail: "一半支出在 200 元以下" },
  ],
  suggestions: [
    { title: "减少外卖", detail: "把外卖支出降低 20%" },
    { title: "设餐饮预算", detail: "每月餐饮预算设为 1500 元" },
    { title: "周末计划", detail: "周末提前安排免费活动" },
  ],
};

it("trims and returns a contract-valid analysis", () => {
  const analysis = decodeReportAnalysis(JSON.stringify(valid));
  expect(analysis.spendingStyle).toBe("餐饮为主的稳定型消费");
  expect(analysis.insights[0]).toEqual({
    title: "餐饮集中",
    detail: "餐饮占支出八成以上",
  });
});

it("strips unknown keys instead of persisting them", () => {
  const analysis = decodeReportAnalysis(
    JSON.stringify({ ...valid, extra: "ignored" }),
  );
  expect(analysis).not.toHaveProperty("extra");
  expect(Object.keys(analysis).sort()).toEqual([
    "insights",
    "spendingStyle",
    "styleTags",
    "suggestions",
  ]);
});

it.each([
  ["non-JSON output", "not json"],
  ["an array", "[]"],
  ["a missing field", JSON.stringify({ spendingStyle: "x", styleTags: ["a"] })],
  [
    "too many suggestions",
    JSON.stringify({
      ...valid,
      suggestions: Array.from({ length: 6 }, () => valid.suggestions[0]),
    }),
  ],
  [
    "an over-long tag",
    JSON.stringify({ ...valid, styleTags: ["x".repeat(25)] }),
  ],
])("rejects %s", (_label, content) => {
  expect(() => decodeReportAnalysis(content)).toThrow(ParseError);
  try {
    decodeReportAnalysis(content);
  } catch (error) {
    expect((error as ParseError).failure).toBe("invalid_response");
  }
});

it("rejects output larger than the contract limit", () => {
  expect(() => decodeReportAnalysis("x".repeat(32_769))).toThrow(ParseError);
});
