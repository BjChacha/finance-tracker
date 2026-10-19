export { EmptyPeriodError, generateReport } from "./generate";
export { useGenerateReport, useLatestReport, useReportList, useReportSnapshot, useStoredReport } from "./hooks";
export { getReport, listReports, saveReport, type ReportSummary, type StoredReport } from "./repository";
export {
  buildReportSnapshot,
  reportSnapshotSchema,
  type ReportPeriod,
  type ReportSnapshot,
  type ReportTotals,
} from "./snapshot";
export {
  reportAnalysisSchema,
  type ReportAnalysis,
  type ReportAnalysisItem,
} from "./analysis-contract";
export { toAnalysisInput, type ReportAnalysisInput } from "./llm-payload";
export { reportsText } from "./labels";
export { LatestReportCard } from "./components/latest-report-card";
export { ReportDetail, ReportDetailScreen } from "./components/report-detail";
export { ReportList } from "./components/report-list";
export {
  closedPeriodSelections,
  runAutoReportsIfNeeded,
  type AutoReportResult,
} from "./auto-generate";
export { ReportsRunner } from "./ReportsRunner";
