import { costMicros, formatCostYuan, priceTierAt } from "../pricing";

/** Beijing 2026-10-19 is a Monday. */
const monday = (hour: number) =>
  new Date(`2026-10-19T${String(hour).padStart(2, "0")}:00:00+08:00`);
const saturday = (hour: number) =>
  new Date(`2026-10-24T${String(hour).padStart(2, "0")}:00:00+08:00`);

describe("Price tier", () => {
  it("bills weekday business windows as peak", () => {
    expect(priceTierAt(monday(9))).toBe("peak");
    expect(priceTierAt(monday(11))).toBe("peak");
    expect(priceTierAt(monday(14))).toBe("peak");
    expect(priceTierAt(monday(17))).toBe("peak");
  });

  it("bills the lunch break and the evening as off-peak", () => {
    expect(priceTierAt(monday(8))).toBe("off_peak");
    expect(priceTierAt(monday(12))).toBe("off_peak");
    expect(priceTierAt(monday(13))).toBe("off_peak");
    expect(priceTierAt(monday(18))).toBe("off_peak");
    expect(priceTierAt(monday(23))).toBe("off_peak");
  });

  it("bills weekends as off-peak all day", () => {
    expect(priceTierAt(saturday(10))).toBe("off_peak");
    expect(priceTierAt(saturday(15))).toBe("off_peak");
  });

  it("uses Beijing time regardless of the device zone", () => {
    // 02:00 UTC = 10:00 Beijing on a Monday.
    expect(priceTierAt(new Date("2026-10-19T02:00:00Z"))).toBe("peak");
    // 03:00 UTC = 11:00 Beijing, but UTC says 03:00 — must still be peak.
    expect(priceTierAt(new Date("2026-10-19T03:00:00Z"))).toBe("peak");
  });
});

describe("Cost", () => {
  const usage = {
    promptTokens: 1000,
    cacheHitTokens: 200,
    cacheMissTokens: 800,
    completionTokens: 100,
  };

  it("prices flash tokens at the off-peak rate", () => {
    // 200×0.02 + 800×1 + 100×4 = 4 + 800 + 400 = 1204 micro-yuan
    expect(costMicros("deepseek-flash", usage, monday(20))).toBe(1204);
  });

  it("doubles the flash price during peak hours", () => {
    expect(costMicros("deepseek-flash", usage, monday(10))).toBe(2408);
  });

  it("prices v4-pro separately", () => {
    // 200×0.15 + 800×4.5 + 100×13.5 = 30 + 3600 + 1350 = 4980
    expect(costMicros("deepseek-v4-pro", usage, monday(20))).toBe(4980);
  });

  it("falls back to flash pricing for an unknown model name", () => {
    expect(costMicros("some-future-model", usage, monday(20))).toBe(1204);
  });
});

describe("formatCostYuan", () => {
  it("prints four decimals", () => {
    expect(formatCostYuan(0)).toBe("¥0.0000");
    expect(formatCostYuan(1204)).toBe("¥0.0012");
    expect(formatCostYuan(98_765_432)).toBe("¥98.7654");
  });

  it("never rounds a real charge down to zero", () => {
    expect(formatCostYuan(1)).toBe("<¥0.0001");
  });
});
