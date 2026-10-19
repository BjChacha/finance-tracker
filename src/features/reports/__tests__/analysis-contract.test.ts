import { ParseError } from "@/features/llm/chat";
import { decodeReportAnalysis } from "../analysis-contract";

const valid = {
	headline: "  这个月的钱，花在了让周五更好过  ",
	mood: {
		label: "松弛",
		score: 4,
		narrative: " 娱乐支出占三成，周末花得比工作日多 ",
	},
	values: [
		{
			id: "self_care",
			label: "对自己好一点",
			narrative: " 餐饮与咖啡支撑了每一个工作日 ",
		},
		{ id: "social", label: "陪人吃饭", narrative: " 聚餐占了娱乐的一半 " },
	],
	dataPoints: [
		{ label: "外卖频次", value: "18 次", note: "几乎每个工作日一次" },
		{ label: "周末占比", value: "62%", note: "周末花得比工作日多" },
	],
	categoryStories: [
		{ category: "餐饮", emotion: "日常慰藉", note: "工作日午餐是稳定支出" },
	],
	suggestions: [
		{
			title: "工作日午餐",
			action: "把每周三次外卖改成自带两次",
			target: "本月外卖≤8次",
			impact: "预计每月省下180元",
		},
		{
			title: "周末预算",
			action: "出门前给周末设一个上限",
			target: "周末单日≤300元",
			impact: "预计每月省下240元",
		},
	],
	savingPotentialYuan: 420,
};

it("trims and returns a v2 contract-valid analysis", () => {
	const analysis = decodeReportAnalysis(JSON.stringify(valid));
	expect(analysis.headline).toBe("这个月的钱，花在了让周五更好过");
	expect(analysis.mood).toEqual({
		label: "松弛",
		score: 4,
		narrative: "娱乐支出占三成，周末花得比工作日多",
	});
	expect(analysis.values[0]).toEqual({
		id: "self_care",
		label: "对自己好一点",
		narrative: "餐饮与咖啡支撑了每一个工作日",
	});
});

it("strips unknown keys instead of persisting them", () => {
	const analysis = decodeReportAnalysis(
		JSON.stringify({ ...valid, extra: "ignored", styleTags: ["old contract"] }),
	);
	expect(analysis).not.toHaveProperty("extra");
	expect(analysis).not.toHaveProperty("styleTags");
	expect(Object.keys(analysis).sort()).toEqual([
		"categoryStories",
		"dataPoints",
		"headline",
		"mood",
		"savingPotentialYuan",
		"suggestions",
		"values",
	]);
});

it.each([
	["non-JSON output", "not json"],
	["an array", "[]"],
	["a missing field", JSON.stringify({ headline: "x", mood: valid.mood })],
	[
		"a mood score outside 1..5",
		JSON.stringify({ ...valid, mood: { ...valid.mood, score: 6 } }),
	],
	[
		"an unknown value id",
		JSON.stringify({
			...valid,
			values: [{ ...valid.values[0], id: "luxury" }],
		}),
	],
	[
		"too many suggestions",
		JSON.stringify({
			...valid,
			suggestions: Array.from({ length: 5 }, () => valid.suggestions[0]),
		}),
	],
	[
		"an over-long action",
		JSON.stringify({
			...valid,
			suggestions: [
				{ ...valid.suggestions[0], action: "x".repeat(161) },
			],
		}),
	],
	[
		"too few data points",
		JSON.stringify({ ...valid, dataPoints: [valid.dataPoints[0]] }),
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
