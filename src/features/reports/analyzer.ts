import {
  completedModelContent,
  type ChatCompletionTransport,
} from "@/features/llm/chat";
import { decodeReportAnalysis, type ReportAnalysis } from "./analysis-contract";
import type { ReportAnalysisInput } from "./llm-payload";
import { buildReportRequest } from "./request";

/**
 * One round trip: the snapshot goes out, a validated analysis comes back. Cancellation and
 * transport failures surface unchanged so the UI can map them to the same copy as recognition.
 */
export function createReportAnalyzer(
  transport: ChatCompletionTransport,
  model: string,
) {
  return async function analyzeReport(
    input: ReportAnalysisInput,
    options: { signal?: AbortSignal } = {},
  ): Promise<ReportAnalysis> {
    const content = completedModelContent(
      await transport(buildReportRequest(input, model), options.signal),
    );
    return decodeReportAnalysis(content);
  };
}
