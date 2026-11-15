import { render, screen } from "@testing-library/react-native";
import { zh } from "@/i18n/zh";
import { SmartRecognitionCard, formatSharePercent } from "../smart-recognition-card";
import { useSmartRecognitionSummary } from "../hooks";
import { formatCostYuan } from "../pricing";

jest.mock("../hooks", () => ({ useSmartRecognitionSummary: jest.fn() }));

const summary = jest.mocked(useSmartRecognitionSummary);

function withSummary(data: unknown) {
  summary.mockReturnValue({ data } as unknown as ReturnType<typeof useSmartRecognitionSummary>);
}

const totals = (overrides: Record<string, number> = {}) => ({
  calls: 0,
  costMicros: 0,
  promptTokens: 0,
  completionTokens: 0,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("formatSharePercent", () => {
  it("占比取整到整数百分比", () => {
    expect(formatSharePercent(42, 100)).toBe("42%");
    expect(formatSharePercent(1, 3)).toBe("33%");
  });

  it("不足 10% 时保留一位小数，不把 1/300 抹成 0%", () => {
    expect(formatSharePercent(1, 300)).toBe("0.3%");
    expect(formatSharePercent(9, 100)).toBe("9.0%");
  });

  it("没有交易时给占位符，异常比例被夹在 0–100%", () => {
    expect(formatSharePercent(0, 0)).toBe("—");
    expect(formatSharePercent(5, 0)).toBe("—");
    expect(formatSharePercent(200, 100)).toBe("100%");
  });
});

describe("SmartRecognitionCard", () => {
  it("同时展示识别生成的笔数、占比与识别花费", () => {
    withSummary({
      month: totals({ calls: 8, costMicros: 1_230_000 }),
      total: totals({ calls: 210, costMicros: 4_560_000, promptTokens: 900_000, completionTokens: 100_000 }),
      generated: 128,
      transactions: 300,
    });

    render(<SmartRecognitionCard />);

    expect(screen.getByText(zh.profile.smartTitle)).toBeTruthy();
    expect(screen.getByText(`128 ${zh.profile.smartCountUnit}`)).toBeTruthy();
    expect(screen.getByText("43%")).toBeTruthy();
    expect(screen.getByText(formatCostYuan(1_230_000))).toBeTruthy();
    expect(screen.getByText(formatCostYuan(4_560_000))).toBeTruthy();
    expect(
      screen.getByText(`${zh.profile.smartCalls} 210 · ${zh.profile.smartTokens} 1,000,000`),
    ).toBeTruthy();
  });

  it("界面文案不再出现模型服务商名字", () => {
    withSummary({
      month: totals({ calls: 1, costMicros: 10_000 }),
      total: totals({ calls: 1, costMicros: 10_000 }),
      generated: 1,
      transactions: 1,
    });

    render(<SmartRecognitionCard />);

    expect(screen.queryByText(/deepseek/i)).toBeNull();
    expect(screen.queryByText("一句话记账花费")).toBeNull();
  });

  it("没有识别记录时花费留空并说明原因", () => {
    withSummary({ month: totals(), total: totals(), generated: 0, transactions: 0 });

    render(<SmartRecognitionCard />);

    expect(screen.getByText(zh.profile.smartEmpty)).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });
});
