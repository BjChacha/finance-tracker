export { EmptyPeriodError, generateReport } from "./generate";
export { useGenerateReport, useReportSnapshot, useStoredReport } from "./hooks";
export { getReport, saveReport, type StoredReport } from "./repository";
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
export { ReportScreen } from "./components/report-screen";
