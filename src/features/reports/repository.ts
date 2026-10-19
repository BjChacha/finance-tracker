import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reports } from "@/db/schema";
import type { BudgetPeriod } from "@/lib/date";
import { newId } from "@/lib/id";
import {
	REPORT_ANALYSIS_VERSION,
	reportAnalysisSchema,
	type ReportAnalysis,
} from "./analysis-contract";
import { reportSnapshotSchema, type ReportSnapshot } from "./snapshot";

export type StoredReport = {
	period: BudgetPeriod;
	periodKey: string;
	snapshot: ReportSnapshot;
	analysis: ReportAnalysis;
	model: string;
	costMicros: number;
	generatedAt: number;
};

/** Lightweight row for the history list; the full payload is loaded on demand. */
export type ReportSummary = {
	period: BudgetPeriod;
	periodKey: string;
	generatedAt: number;
	headline: string;
	moodLabel: string;
};

function parseJson(value: string): unknown | null {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

/**
 * Returns the stored report, or null when it is missing, written by an older contract, or no
 * longer parses. A corrupt row must not block the period: the caller simply regenerates it.
 */
export async function getReport(
	period: BudgetPeriod,
	periodKey: string,
): Promise<StoredReport | null> {
	const [row] = await db
		.select()
		.from(reports)
		.where(and(eq(reports.period, period), eq(reports.periodKey, periodKey)))
		.limit(1);
	if (!row) return null;
	if (row.analysisVersion !== REPORT_ANALYSIS_VERSION) return null;
	const snapshot = reportSnapshotSchema.safeParse(parseJson(row.snapshot));
	const analysis = reportAnalysisSchema.safeParse(parseJson(row.analysis));
	if (!snapshot.success || !analysis.success) {
		console.warn("[reports] Discarding a stored report that no longer parses", {
			period,
			periodKey,
		});
		return null;
	}
	return {
		period: row.period,
		periodKey: row.periodKey,
		snapshot: snapshot.data,
		analysis: analysis.data,
		model: row.model,
		costMicros: row.costMicros,
		generatedAt: row.generatedAt,
	};
}

/**
 * Newest-first summaries for the history list. Rows from an older contract are filtered out:
 * showing a card that cannot open would be worse than showing nothing.
 */
export async function listReports(limit = 60): Promise<ReportSummary[]> {
	const rows = await db
		.select({
			period: reports.period,
			periodKey: reports.periodKey,
			generatedAt: reports.generatedAt,
			analysis: reports.analysis,
			analysisVersion: reports.analysisVersion,
		})
		.from(reports)
		.orderBy(desc(reports.generatedAt))
		.limit(limit);
	const summaries: ReportSummary[] = [];
	for (const row of rows) {
		if (row.analysisVersion !== REPORT_ANALYSIS_VERSION) continue;
		const parsed = reportAnalysisSchema.safeParse(parseJson(row.analysis));
		if (!parsed.success) continue;
		summaries.push({
			period: row.period,
			periodKey: row.periodKey,
			generatedAt: row.generatedAt,
			headline: parsed.data.headline,
			moodLabel: parsed.data.mood.label,
		});
	}
	return summaries;
}

/** Regeneration replaces the previous analysis instead of piling up duplicates. */
export async function saveReport(report: StoredReport): Promise<void> {
	const values = {
		period: report.period,
		periodKey: report.periodKey,
		snapshot: JSON.stringify(report.snapshot),
		analysis: JSON.stringify(report.analysis),
		analysisVersion: REPORT_ANALYSIS_VERSION,
		model: report.model,
		costMicros: report.costMicros,
		generatedAt: report.generatedAt,
	};
	await db
		.insert(reports)
		.values({ id: newId(), ...values })
		.onConflictDoUpdate({
			target: [reports.period, reports.periodKey],
			set: values,
		});
}
