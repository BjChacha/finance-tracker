import { naturalLanguageCurrencyEvidence } from "../currency-evidence";

describe("Natural language currency evidence", () => {
  it.each([
    ["订阅YouTube Premium花了2.99美元", "USD"],
    ["Netflix 2.99刀", "USD"],
    ["$2.99", "USD"],
    ["US$2.99", "USD"],
    ["花了两千欧", "EUR"],
    ["3.5欧", "EUR"],
    ["打车花了60港币", "HKD"],
    ["HK$300打车", "HKD"],
    ["6000円", "JPY"],
    ["买咖啡3.5英镑", "GBP"],
    ["5万韩元", "KRW"],
    ["坐地铁2.5新币", "SGD"],
    ["超市消费120澳元", "AUD"],
    ["交学费2000加元", "CAD"],
    ["兑换了100美元，约720人民币", "USD"],
  ])("detects %j", (text, expected) => {
    expect(naturalLanguageCurrencyEvidence(text)).toBe(expected);
  });

  it.each([
    ["午饭吃了25元"],
    ["打车30块"],
    ["买了把刀花了30元"],
    ["两把刀30元"],
    ["会员费2.99"],
  ])("falls back to no evidence for %j", (text) => {
    expect(naturalLanguageCurrencyEvidence(text)).toBeNull();
  });

  it("returns null when several foreign currencies compete", () => {
    expect(naturalLanguageCurrencyEvidence("3.99美元和2.99欧元")).toBeNull();
  });
});
