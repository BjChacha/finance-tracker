import { closedPeriodSelections } from "../periods";

describe("closedPeriodSelections", () => {
	it("targets the most recent fully closed month, quarter and year", () => {
		expect(closedPeriodSelections("2026-10-20")).toEqual([
			{ period: "month", key: "2026-09" },
			{ period: "quarter", key: "2026-Q3" },
			{ period: "year", key: "2025" },
		]);
	});

	it("rolls the month and quarter back across a year boundary", () => {
		expect(closedPeriodSelections("2026-01-05")).toEqual([
			{ period: "month", key: "2025-12" },
			{ period: "quarter", key: "2025-Q4" },
			{ period: "year", key: "2025" },
		]);
	});

	it("never reports the period that is currently running", () => {
		for (const today of ["2026-04-01", "2026-07-01", "2026-12-31"]) {
			const [month, quarter, year] = closedPeriodSelections(today);
			const currentMonth = today.slice(0, 7);
			const currentYear = today.slice(0, 4);
			expect(month.key).not.toBe(currentMonth);
			expect(quarter.key.startsWith(currentYear)).toBe(
				Number(today.slice(5, 7)) > 3,
			);
			expect(year.key).not.toBe(currentYear);
		}
	});

	it("maps the first day of a quarter to the previous quarter", () => {
		expect(closedPeriodSelections("2026-04-01")[1]).toEqual({
			period: "quarter",
			key: "2026-Q1",
		});
		expect(closedPeriodSelections("2026-07-01")[1]).toEqual({
			period: "quarter",
			key: "2026-Q2",
		});
		expect(closedPeriodSelections("2026-10-01")[1]).toEqual({
			period: "quarter",
			key: "2026-Q3",
		});
	});
});
