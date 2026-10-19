import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PeriodSelection } from "@/lib/analytics-range";
import { useTodayKey } from "@/lib/use-today-key";
import { generateReport } from "./generate";
import { getReport, listReports, type ReportSummary } from "./repository";
import { buildReportSnapshot } from "./snapshot";

const storedKey = (period: string, periodKey: string) =>
  ["reports", "stored", period, periodKey] as const;

const snapshotKey = (period: string, periodKey: string, today: string) =>
  ["reports", "snapshot", period, periodKey, today] as const;

const listKey = ["reports", "list"] as const;

/** Local aggregates: shown immediately, never billed and safe to view offline. */
export function useReportSnapshot(selection: PeriodSelection) {
  const today = useTodayKey();
  return useQuery({
    queryKey: snapshotKey(selection.period, selection.key, today),
    queryFn: () => buildReportSnapshot(selection),
  });
}

/** The persisted analysis for a period, if one was generated before. */
export function useStoredReport(selection: PeriodSelection) {
  return useQuery({
    queryKey: storedKey(selection.period, selection.key),
    queryFn: () => getReport(selection.period, selection.key),
  });
}

/** Persisted history, newest first. Drives the report list and the dashboard card. */
export function useReportList() {
	return useQuery({ queryKey: listKey, queryFn: () => listReports() });
}

/** The newest stored report, or null when nothing has been generated yet. */
export function useLatestReport(): {
	isPending: boolean;
	isError: boolean;
	data: ReportSummary | null;
} {
	const query = useReportList();
	return {
		isPending: query.isPending,
		isError: query.isError,
		data: query.data?.[0] ?? null,
	};
}

/**
 * The selection travels as a mutation variable rather than a captured closure: switching the
 * period mid-flight must not make the new period look busy or inherit the old period's error.
 */
export function useGenerateReport() {
  const queryClient = useQueryClient();
  const today = useTodayKey();
  return useMutation({
    mutationFn: (selection: PeriodSelection) => generateReport(selection),
    onSuccess: (report, selection) => {
      queryClient.setQueryData(
        storedKey(selection.period, selection.key),
        report,
      );
      queryClient.setQueryData(
        snapshotKey(selection.period, selection.key, today),
        report.snapshot,
      );
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ queryKey: ["llm-usage"] });
    },
  });
}
