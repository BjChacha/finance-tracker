import type { PeriodSelection } from "@/lib/analytics-range";
import { toAnalysisInput } from "./llm-payload";
import { analyzeReportRemotely } from "./remote-analyzer";
import { saveReport, type StoredReport } from "./repository";
import { buildReportSnapshot } from "./snapshot";

/** Raised before any network call: an empty period has nothing to analyse. */
export class EmptyPeriodError extends Error {
  constructor() {
    super("A report needs at least one transaction in the selected period");
    this.name = "EmptyPeriodError";
  }
}

/**
 * Snapshot, analyse, persist. The snapshot is rebuilt here so the analysis always reflects the
 * data in the database at generation time, then stored together with the analysis.
 */
export async function generateReport(
  selection: PeriodSelection,
  options: { signal?: AbortSignal } = {},
): Promise<StoredReport> {
  const snapshot = await buildReportSnapshot(selection);
  if (snapshot.totals.expenseCount === 0 && snapshot.totals.incomeCents === 0)
    throw new EmptyPeriodError();
  const generated = await analyzeReportRemotely(
    toAnalysisInput(snapshot),
    options,
  );
  const stored: StoredReport = {
    period: selection.period,
    periodKey: selection.key,
    snapshot,
    analysis: generated.analysis,
    model: generated.model,
    costMicros: generated.costMicros,
    generatedAt: generated.generatedAt,
  };
  await saveReport(stored);
  return stored;
}
