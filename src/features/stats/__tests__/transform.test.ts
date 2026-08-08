import {
	axisLabel,
	bucketKey,
	bucketKeys,
	buildTrendSeries,
	cumulateNetWorth,
	heatLevel,
	monthKeysBack,
	withPercent,
} from "../transform";

describe("bucketKey", () => {
	it("day 直接返回 dateKey", () => {
		expect(bucketKey("2026-07-07", "day")).toBe("2026-07-07");
	});
	it("week 返回周一（zh-cn 周起始）", () => {
		// 2026-07-07 是周二，周一为 2026-07-06
		expect(bucketKey("2026-07-07", "week")).toBe("2026-07-06");
		// 周一归属自身
		expect(bucketKey("2026-07-06", "week")).toBe("2026-07-06");
		// 周日归属本周周一
		expect(bucketKey("2026-07-12", "week")).toBe("2026-07-06");
	});
	it("month / year 截取前缀", () => {
		expect(bucketKey("2026-07-07", "month")).toBe("2026-07");
		expect(bucketKey("2026-07-07", "year")).toBe("2026");
	});
});

describe("bucketKeys", () => {
	it("day 粒度生成范围内每一天", () => {
		expect(bucketKeys("2026-07-01", "2026-07-03", "day")).toEqual([
			"2026-07-01",
			"2026-07-02",
			"2026-07-03",
		]);
	});
	it("week 粒度从起始日所在周一开始", () => {
		// 7/1 是周三，所在周一 6/29
		expect(bucketKeys("2026-07-01", "2026-07-14", "week")).toEqual([
			"2026-06-29",
			"2026-07-06",
			"2026-07-13",
		]);
	});
	it("month 粒度生成月份键", () => {
		expect(bucketKeys("2026-05-10", "2026-07-07", "month")).toEqual([
			"2026-05",
			"2026-06",
			"2026-07",
		]);
	});
});

describe("buildTrendSeries", () => {
	it("无数据日补 0 且保持顺序", () => {
		const series = buildTrendSeries(
			[
				{ dateKey: "2026-07-01", income: 100, expense: 200 },
				{ dateKey: "2026-07-03", income: 0, expense: 500 },
			],
			"day",
			"2026-07-01",
			"2026-07-04",
		);
		expect(series.map((p) => p.expense)).toEqual([200, 0, 500, 0]);
		expect(series.map((p) => p.income)).toEqual([100, 0, 0, 0]);
		expect(series[0]).toMatchObject({ key: "2026-07-01", label: "7.1" });
	});
	it("week 粒度按周一分桶累加", () => {
		const series = buildTrendSeries(
			[
				{ dateKey: "2026-07-06", income: 0, expense: 100 }, // 周一
				{ dateKey: "2026-07-12", income: 0, expense: 50 }, // 同周周日
				{ dateKey: "2026-07-13", income: 300, expense: 0 }, // 下周一
			],
			"week",
			"2026-07-06",
			"2026-07-19",
		);
		expect(series).toHaveLength(2);
		expect(series[0]).toMatchObject({
			key: "2026-07-06",
			expense: 150,
			income: 0,
		});
		expect(series[1]).toMatchObject({
			key: "2026-07-13",
			expense: 0,
			income: 300,
		});
	});
	it("全空数据也返回完整补零序列", () => {
		const series = buildTrendSeries([], "month", "2026-01-01", "2026-03-31");
		expect(series.map((p) => p.key)).toEqual(["2026-01", "2026-02", "2026-03"]);
		expect(series.every((p) => p.income === 0 && p.expense === 0)).toBe(true);
	});
	it("month 粒度跨年时 label 带年份", () => {
		const series = buildTrendSeries([], "month", "2025-11-01", "2026-02-28");
		expect(series.map((p) => p.key)).toEqual([
			"2025-11",
			"2025-12",
			"2026-01",
			"2026-02",
		]);
		expect(series.map((p) => p.label)).toEqual([
			"2025.11",
			"2025.12",
			"2026.01",
			"2026.02",
		]);
	});
	it("month 粒度同年时 label 为纯月份数字", () => {
		const series = buildTrendSeries([], "month", "2026-06-01", "2026-08-31");
		expect(series.map((p) => p.label)).toEqual(["6", "7", "8"]);
	});
});

describe("axisLabel", () => {
	it("day/week 粒度用 M.D（不受跨年影响）", () => {
		expect(axisLabel("2026-08-11", "day", false)).toBe("8.11");
		expect(axisLabel("2026-08-11", "day", true)).toBe("8.11");
		expect(axisLabel("2026-08-11", "week", false)).toBe("8.11");
	});
	it("month 粒度同年用纯月份数字，跨年带年份", () => {
		expect(axisLabel("2026-08", "month", false)).toBe("8");
		expect(axisLabel("2026-08", "month", true)).toBe("2026.08");
	});
	it("year 粒度用纯年份数字", () => {
		expect(axisLabel("2026", "year", false)).toBe("2026");
	});
});

describe("monthKeysBack", () => {
	it("生成升序的最近 N 个月份键", () => {
		expect(monthKeysBack("2026-07", 3)).toEqual([
			"2026-05",
			"2026-06",
			"2026-07",
		]);
	});
	it("跨年正确", () => {
		expect(monthKeysBack("2026-02", 4)).toEqual([
			"2025-11",
			"2025-12",
			"2026-01",
			"2026-02",
		]);
	});
});

describe("heatLevel", () => {
	it("无支出或 max<=0 返回 0", () => {
		expect(heatLevel(0, 1000)).toBe(0);
		expect(heatLevel(100, 0)).toBe(0);
	});
	it("按相对最大值四等分 1-4", () => {
		expect(heatLevel(250, 1000)).toBe(1);
		expect(heatLevel(251, 1000)).toBe(2);
		expect(heatLevel(500, 1000)).toBe(2);
		expect(heatLevel(750, 1000)).toBe(3);
		expect(heatLevel(1000, 1000)).toBe(4);
	});
});

describe("cumulateNetWorth", () => {
	it("累计窗口前的变动并逐月累进", () => {
		const points = cumulateNetWorth(
			10000,
			[
				{ month: "2026-03", delta: 500 }, // 窗口之前
				{ month: "2026-06", delta: -200 },
				{ month: "2026-07", delta: 1000 },
			],
			["2026-05", "2026-06", "2026-07"],
		);
		expect(points).toEqual([
			{ month: "2026-05", value: 10500 },
			{ month: "2026-06", value: 10300 },
			{ month: "2026-07", value: 11300 },
		]);
	});
	it("无变动时各月等于 base", () => {
		expect(cumulateNetWorth(100, [], ["2026-06", "2026-07"])).toEqual([
			{ month: "2026-06", value: 100 },
			{ month: "2026-07", value: 100 },
		]);
	});
});

describe("withPercent", () => {
	it("计算占比并保留一位小数", () => {
		const rows = withPercent([{ total: 100 }, { total: 200 }, { total: 700 }]);
		expect(rows.map((r) => r.pct)).toEqual([10, 20, 70]);
	});
	it("总额为 0 时占比为 0", () => {
		expect(withPercent([{ total: 0 }]).map((r) => r.pct)).toEqual([0]);
	});
});
