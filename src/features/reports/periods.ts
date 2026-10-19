import type { PeriodSelection } from "@/lib/analytics-range";
import { shiftPeriodKey } from "@/lib/date";

/**
 * The most recent fully closed month, quarter and year for a given day.
 *
 * Pure period math, kept free of database and network imports so it stays trivially testable and
 * can never trigger a model call.
 */
export function closedPeriodSelections(today: string): PeriodSelection[] {
	const year = today.slice(0, 4);
	const month = today.slice(0, 7);
	const quarter = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1;
	return [
		{ period: "month", key: shiftPeriodKey("month", month, -1) },
		{ period: "quarter", key: shiftPeriodKey("quarter", `${year}-Q${quarter}`, -1) },
		{ period: "year", key: shiftPeriodKey("year", year, -1) },
	];
}
