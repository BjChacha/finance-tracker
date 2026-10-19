import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reports } from "@/db/schema";
import type { BudgetPeriod } from "@/lib/date";
import { newId } from "@/lib/id";
import {
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

function parseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Returns the stored report, or null when it is missing or no longer matches the contracts.
 * A corrupt row must not block the period: the caller simply offers to regenerate it.
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

/** Regeneration replaces the previous analysis instead of piling up duplicates. */
export async function saveReport(report: StoredReport): Promise<void> {
  const values = {
    period: report.period,
    periodKey: report.periodKey,
    snapshot: JSON.stringify(report.snapshot),
    analysis: JSON.stringify(report.analysis),
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
