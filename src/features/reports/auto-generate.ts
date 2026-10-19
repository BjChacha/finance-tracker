import { todayKey } from "@/lib/date";
import type { PeriodSelection } from "@/lib/analytics-range";
import { generateReport } from "./generate";
import { closedPeriodSelections } from "./periods";
import { getReport } from "./repository";
import { buildReportSnapshot } from "./snapshot";

export { closedPeriodSelections } from "./periods";

/**
 * Automatic period reports.
 *
 * A report is generated for a period only after it has fully closed: the user may not have the
 * app open at 23:59 on the last day, so "first launch after the period ended" is the reliable
 * trigger. Three closed periods are considered — the previous month, quarter and year — and only
 * when that period actually has transactions.
 *
 * Cost control (the model is billed per call):
 * - at most one pass per day (`lastSuccessDay`),
 * - one in-flight pass at a time,
 * - a failed pass backs off for six hours instead of retrying on every foreground event,
 * - only the most recent closed period of each type is ever considered, never the whole history.
 */

/** Failures are usually a missing key or a transient network error; retrying hourly is noise. */
const FAILURE_BACKOFF_MS = 6 * 60 * 60 * 1000;

export type AutoReportResult = {
	generated: PeriodSelection[];
	/** Closed periods that already had a report. */
	existing: number;
	/** Closed periods without transactions, so nothing to analyse. */
	empty: number;
};

let lastSuccessDay: string | null = null;
let lastFailureAt: number | null = null;
let inFlight: Promise<AutoReportResult> | null = null;

/** Test seam: forget the throttles so a suite can run several passes. */
export function resetAutoReportState(): void {
	lastSuccessDay = null;
	lastFailureAt = null;
	inFlight = null;
}

async function generateClosedReports(today: string): Promise<AutoReportResult> {
	const generated: PeriodSelection[] = [];
	let existing = 0;
	let empty = 0;
	for (const selection of closedPeriodSelections(today)) {
		if (await getReport(selection.period, selection.key)) {
			existing += 1;
			continue;
		}
		const snapshot = await buildReportSnapshot(selection, today);
		if (snapshot.totals.expenseCount === 0 && snapshot.totals.incomeCents === 0) {
			empty += 1;
			continue;
		}
		// A failure here (missing key, network, bad payload) aborts the pass: the next period
		// would call the same failing service, and the backoff above already bounds retries.
		await generateReport(selection);
		generated.push(selection);
	}
	return { generated, existing, empty };
}

/**
 * Runs one automatic pass when due. Returns null when throttled or already running — callers
 * treat that as "nothing to refresh".
 */
export async function runAutoReportsIfNeeded(): Promise<AutoReportResult | null> {
	const today = todayKey();
	if (lastSuccessDay === today) return null;
	if (lastFailureAt !== null && Date.now() - lastFailureAt < FAILURE_BACKOFF_MS)
		return null;
	if (inFlight) return inFlight;
	const pass = (async () => {
		try {
			const result = await generateClosedReports(today);
			lastSuccessDay = today;
			lastFailureAt = null;
			return result;
		} catch (error) {
			lastFailureAt = Date.now();
			throw error;
		} finally {
			inFlight = null;
		}
	})();
	inFlight = pass;
	return pass;
}
